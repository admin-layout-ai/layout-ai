# backend/app/routers/payments.py
# UPDATED: Payments router with B2C authentication
# This replaces your current payments.py - now uses token auth instead of user_id param

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from datetime import datetime
import os
import logging

from .. import models, schemas
from ..database import get_db
from ..auth import get_current_user, AuthenticatedUser
from ..services.payment_service import payment_service
from ..analytics import analytics

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/payments", tags=["payments"])


def get_db_user(current_user: AuthenticatedUser, db: Session) -> models.User:
    """Helper to get database user from authenticated token user."""
    db_user = db.query(models.User).filter(
        models.User.azure_ad_id == current_user.id
    ).first()
    
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found. Please sign in again.")
    
    return db_user


@router.post("/create-checkout")
async def create_checkout(
    project_id: int,
    plan_type: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Create a Stripe Checkout session for a project.
    
    Args:
        project_id: ID of the project to generate plans for
        plan_type: 'basic', 'standard', or 'premium'
    """
    db_user = get_db_user(current_user, db)
    
    # Validate plan type
    if plan_type not in ['basic', 'standard', 'premium']:
        raise HTTPException(status_code=400, detail="Invalid plan type")
    
    # Verify project exists and belongs to user
    project = db.query(models.Project).filter(
        models.Project.id == project_id,
        models.Project.user_id == db_user.id
    ).first()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
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
            user_email=db_user.email,
            success_url=f"{frontend_url}/dashboard/projects?id={project_id}&payment=success",
            cancel_url=f"{frontend_url}/dashboard/projects?id={project_id}&payment=cancelled"
        )
        
        # Create payment record in database
        payment = models.Payment(
            user_id=db_user.id,
            project_id=project_id,
            amount=payment_service.PLAN_PRICES[plan_type],
            currency="AUD",
            status="pending",
            payment_method="stripe",
            plan_type=plan_type,
            stripe_payment_intent_id=session['session_id'],
            description=f"{plan_type.title()} floor plan for {project.name}",
            created_at=datetime.utcnow()
        )
        db.add(payment)
        db.commit()
        
        # Track analytics
        analytics.track_event("payment_initiated", db_user.id, {
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
    Handle Stripe webhooks.
    This endpoint receives events from Stripe when payments complete.
    
    Note: This endpoint does NOT use auth - Stripe calls it directly.
    """
    payload = await request.body()
    sig_header = request.headers.get('stripe-signature')
    
    try:
        event = payment_service.verify_webhook_signature(payload, sig_header)
    except ValueError as e:
        logger.error(f"Webhook signature verification failed: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    
    # Handle checkout.session.completed
    if event['type'] == 'checkout.session.completed':
        session = event['data']['object']
        
        payment = db.query(models.Payment).filter(
            models.Payment.stripe_payment_intent_id == session['id']
        ).first()
        
        if payment:
            payment.status = 'completed'
            payment.stripe_customer_id = session.get('customer')
            
            # Update project to trigger floor plan generation
            project = db.query(models.Project).filter(
                models.Project.id == payment.project_id
            ).first()
            
            if project:
                project.status = models.ProjectStatus.GENERATING
                
                analytics.track_event("payment_completed", payment.user_id, {
                    "project_id": payment.project_id,
                    "plan_type": payment.plan_type,
                    "amount": payment.amount
                })
                
                logger.info(f"Payment completed for project {project.id}")
            
            db.commit()
    
    elif event['type'] == 'checkout.session.expired':
        session = event['data']['object']
        
        payment = db.query(models.Payment).filter(
            models.Payment.stripe_payment_intent_id == session['id']
        ).first()
        
        if payment:
            payment.status = 'expired'
            db.commit()
            logger.info(f"Payment session expired for project {payment.project_id}")
    
    elif event['type'] == 'payment_intent.payment_failed':
        payment_intent = event['data']['object']
        
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
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Verify a payment session (called from success page).
    """
    db_user = get_db_user(current_user, db)
    
    try:
        # Retrieve session from Stripe
        session_data = payment_service.retrieve_session(session_id)
        
        # Find payment in database
        payment = db.query(models.Payment).filter(
            models.Payment.stripe_payment_intent_id == session_id,
            models.Payment.user_id == db_user.id
        ).first()
        
        if not payment:
            raise HTTPException(status_code=404, detail="Payment not found")
        
        return {
            "payment_id": payment.id,
            "project_id": payment.project_id,
            "status": payment.status,
            "amount": payment.amount,
            "plan_type": payment.plan_type,
            "stripe_status": session_data.get('payment_status', 'unknown')
        }
        
    except Exception as e:
        logger.error(f"Error verifying payment: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/history")
async def get_payment_history(
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get payment history for the current user."""
    db_user = get_db_user(current_user, db)
    
    payments = db.query(models.Payment).filter(
        models.Payment.user_id == db_user.id
    ).order_by(models.Payment.created_at.desc()).all()
    
    return [
        {
            "id": p.id,
            "project_id": p.project_id,
            "amount": p.amount,
            "currency": p.currency,
            "status": p.status,
            "plan_type": p.plan_type,
            "description": p.description,
            "created_at": p.created_at.isoformat() if p.created_at else None
        }
        for p in payments
    ]
