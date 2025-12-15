import sys
sys.path.append('..')

from app.database import SessionLocal
from app.models import User
import secrets

def create_test_users():
    db = SessionLocal()
    
    test_users = [
        {
            "azure_ad_id": f"beta-tester-{secrets.token_hex(4)}",
            "email": "builder1@test.layoutai.com.au",
            "full_name": "Test Builder 1",
            "company_name": "ABC Constructions",
            "is_builder": True,
            "subscription_tier": "free"
        },
        {
            "azure_ad_id": f"beta-tester-{secrets.token_hex(4)}",
            "email": "builder2@test.layoutai.com.au",
            "full_name": "Test Builder 2",
            "company_name": "XYZ Homes",
            "is_builder": True,
            "subscription_tier": "free"
        },
        {
            "azure_ad_id": f"beta-tester-{secrets.token_hex(4)}",
            "email": "developer@test.layoutai.com.au",
            "full_name": "Test Developer",
            "company_name": "DEV Properties",
            "is_builder": False,
            "subscription_tier": "free"
        }
    ]
    
    for user_data in test_users:
        user = User(**user_data)
        db.add(user)
        print(f"✅ Created: {user_data['email']}")
    
    db.commit()
    print("\n🎉 Test users created successfully!")
    print("\nCredentials saved to: test_credentials.txt")
    
    # Save credentials
    with open('test_credentials.txt', 'w') as f:
        for user_data in test_users:
            f.write(f"Email: {user_data['email']}\n")
            f.write(f"Azure AD ID: {user_data['azure_ad_id']}\n")
            f.write("-" * 50 + "\n")
    
    db.close()

if __name__ == "__main__":
    create_test_users()