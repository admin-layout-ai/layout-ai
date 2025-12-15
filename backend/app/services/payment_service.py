import stripe
import os
from typing import Dict, Optional
from dotenv import load_dotenv

load_dotenv()

stripe.api_key = os.getenv("STRIPE_SECRET_KEY")

class PaymentService:
    """Handle all Stripe payment operations"""
    
    # Pricing in cents (AUD)
    PLAN_PRICES = {
        'basic': 9900,      # $99.00
        'standard': 19900,  # $199.00
        'premium': 39900,   # $399.00
    }
    
    PLAN_DETAILS = {
        'basic': {
            'name': 'Basic Floor Plan',
            'features': [
                '1 floor plan design',
                '2 revision rounds',
                'PDF export',
                'Basic compliance check'
            ]
        },
        'standard': {
            'name': 'Standard Floor Plan',
            'features': [
                '3 floor plan options',
                '5 revision rounds',
                'PDF + DXF export',
                'Facade design',
                'Full compliance report'
            ]
        },
        'premium': {
            'name': 'Premium Floor Plan',
            'features': [
                '5 floor plan options',
                'Unlimited revisions',
                'All file formats',
                '3D renders',
                'Material schedules',
                'Priority support'
            ]
        }
    }
    
    def create_checkout_session(
        self,
        plan_type: str,
        project_id: int,
        user_email: str,
        success_url: str,
        cancel_url: str
    ) -> Dict:
        """
        Create a Stripe Checkout session for one-time payment
        
        Args:
            plan_type: 'basic', 'standard', or 'premium'
            project_id: ID of the project
            user_email: User's email address
            success_url: Where to redirect after successful payment
            cancel_url: Where to redirect if payment is cancelled
            
        Returns:
            Dictionary with session_id and checkout_url
        """
        if plan_type not in self.PLAN_PRICES:
            raise ValueError(f"Invalid plan type: {plan_type}")
        
        try:
            session = stripe.checkout.Session.create(
                payment_method_types=['card'],
                line_items=[{
                    'price_data': {
                        'currency': 'aud',
                        'product_data': {
                            'name': self.PLAN_DETAILS[plan_type]['name'],
                            'description': ', '.join(self.PLAN_DETAILS[plan_type]['features'][:3]),
                        },
                        'unit_amount': self.PLAN_PRICES[plan_type],
                    },
                    'quantity': 1,
                }],
                mode='payment',
                success_url=success_url + '?session_id={CHECKOUT_SESSION_ID}',
                cancel_url=cancel_url,
                customer_email=user_email,
                metadata={
                    'project_id': str(project_id),
                    'plan_type': plan_type,
                }
            )
            
            return {
                'session_id': session.id,
                'checkout_url': session.url
            }
        except stripe.error.StripeError as e:
            raise Exception(f"Stripe error: {str(e)}")
    
    def verify_webhook_signature(self, payload: bytes, sig_header: str) -> Dict:
        """
        Verify that webhook came from Stripe
        
        Args:
            payload: Raw request body
            sig_header: Stripe signature header
            
        Returns:
            Verified event object
        """
        webhook_secret = os.getenv("STRIPE_WEBHOOK_SECRET")
        
        try:
            event = stripe.Webhook.construct_event(
                payload, sig_header, webhook_secret
            )
            return event
        except ValueError:
            raise ValueError("Invalid payload")
        except stripe.error.SignatureVerificationError:
            raise ValueError("Invalid signature")
    
    def retrieve_session(self, session_id: str) -> Dict:
        """Retrieve a checkout session by ID"""
        try:
            session = stripe.checkout.Session.retrieve(session_id)
            return {
                'id': session.id,
                'payment_status': session.payment_status,
                'customer_email': session.customer_email,
                'amount_total': session.amount_total,
                'metadata': session.metadata
            }
        except stripe.error.StripeError as e:
            raise Exception(f"Error retrieving session: {str(e)}")

# Singleton instance
payment_service = PaymentService()