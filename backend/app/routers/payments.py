from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from .. import models, schemas
from ..database import get_db
from ..services.payment_service import payment_service
from ..analytics import analytics
import os
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/payments", tags=["payments"])

@router.post("/create-checkout")
async def create_checkout(
    project_id: int,
    plan_type: str,
    user_id: int,
    db: Session = Depends(get_db)
):
    """
    Create a Stripe Checkout session for a project
    
    Args:
        project_id: ID of the project to generate plans for
        plan_type: 'basic', 'standard', or 'premium'
        user_id: Current user ID
    """
    # Verify project exists and belongs to user
    project = db.query(models.Project).filter(
        models.Project.id == project_id,
        models.Project.user_id == user_id
    ).first()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Get user email
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check if project already has a pending/completed payment
    existing_payment = db.query(models.Payment).filter(
        models.Payment.project_id == project_id,
        models.Payment.status.in_(['pending', 'completed'])
    ).first()
    
    if existing_payment:
        raise HTTPException(
            status_code=400, 
            detail="Payment already exists for this project"
        )
    
    try:
        # Create Stripe checkout session
        frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
        session = payment_service.create_checkout_session(
            plan_type=plan_type,
            project_id=project_id,
            user_email=user.email,
            success_url=f"{frontend_url}/projects/{project_id}/success",
            cancel_url=f"{frontend_url}/projects/{project_id}"
        )
        
        # Create payment record in database
        payment = models.Payment(
            user_id=user_id,
            project_id=project_id,
            amount=payment_service.PLAN_PRICES[plan_type],
            currency="AUD",
            status="pending",
            payment_method="stripe",
            plan_type=plan_type,
            stripe_payment_intent_id=session['session_id'],
            description=f"{plan_type.title()} floor plan for {project.name}"
        )
        db.add(payment)
        db.commit()
        
        # Track analytics
        analytics.track_event("payment_initiated", user_id, {
            "project_id": project_id,
            "plan_type": plan_type,
            "amount": payment_service.PLAN_PRICES[plan_type]
        })
        
        return {
            "session_id": session['session_id'],
            "checkout_url": session['checkout_url']
        }
        
    except Exception as e:
        logger.error(f"Error creating checkout session: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/webhook")
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    """
    Handle Stripe webhooks
    
    This endpoint receives events from Stripe when payments are completed,
    failed, or other events occur.
    """
    payload = await request.body()
    sig_header = request.headers.get('stripe-signature')
    
    try:
        event = payment_service.verify_webhook_signature(payload, sig_header)
    except ValueError as e:
        logger.error(f"Webhook signature verification failed: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    
    # Handle different event types
    if event['type'] == 'checkout.session.completed':
        session = event['data']['object']
        
        # Update payment status in database
        payment = db.query(models.Payment).filter(
            models.Payment.stripe_payment_intent_id == session['id']
        ).first()
        
        if payment:
            payment.status = 'completed'
            payment.stripe_customer_id = session.get('customer')
            
            # Update project status to trigger floor plan generation
            project = db.query(models.Project).filter(
                models.Project.id == payment.project_id
            ).first()
            
            if project:
                project.status = models.ProjectStatus.GENERATING
                
                # Track successful payment
                analytics.track_event("payment_completed", payment.user_id, {
                    "project_id": payment.project_id,
                    "plan_type": payment.plan_type,
                    "amount": payment.amount
                })
                
                logger.info(f"Payment completed for project {project.id}")
            
            db.commit()
    
    elif event['type'] == 'checkout.session.expired':
        session = event['data']['object']
        
        # Update payment status to expired
        payment = db.query(models.Payment).filter(
            models.Payment.stripe_payment_intent_id == session['id']
        ).first()
        
        if payment:
            payment.status = 'expired'
            db.commit()
            logger.info(f"Payment session expired for project {payment.project_id}")
    
    elif event['type'] == 'payment_intent.payment_failed':
        payment_intent = event['data']['object']
        
        # Handle failed payment
        payment = db.query(models.Payment).filter(
            models.Payment.stripe_payment_intent_id == payment_intent['id']
        ).first()
        
        if payment:
            payment.status = 'failed'
            db.commit()
            logger.warning(f"Payment failed for project {payment.project_id}")
    
    return {"status": "success"}

@router.get("/verify/{session_id}")
async def verify_payment(
    session_id: str,
    user_id: int,
    db: Session = Depends(get_db)
):
    """
    Verify a payment session (called from success page)
    
    Args:
        session_id: Stripe checkout session ID
        user_id: Current user ID
    """
    try:
        # Retrieve session from Stripe
        session_data = payment_service.retrieve_session(session_id)
        
        # Find payment in database
        payment = db.query(models.Payment).filter(
            models.Payment.stripe_payment_intent_id == session_id,
            models.Payment.user_id == user_id
        ).first()
        
        if not payment:
            raise HTTPException(status_code=404, detail="Payment not found")
        
        return {
            "payment_id": payment.id,
            "project_id": payment.project_id,
            "status": payment.status,
            "amount": payment.amount,
            "plan_type": payment.plan_type,
            "stripe_status": session_data['payment_status']
        }
        
    except Exception as e:
        logger.error(f"Error verifying payment: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))