from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os
from dotenv import load_dotenv
import urllib

# Load environment variables
load_dotenv()

# Get the raw connection string from Azure
raw_connection_string = os.getenv("DATABASE_URL")

if not raw_connection_string:
    raise ValueError("DATABASE_URL environment variable not set")

def parse_azure_connection_string(conn_str):
    """Parse Azure SQL connection string into SQLAlchemy format"""
    # Clean up the connection string
    conn_str = conn_str.strip()
    
    # Parse the connection string
    parts = {}
    for part in conn_str.split(';'):
        part = part.strip()
        if '=' in part and part:
            key, value = part.split('=', 1)
            parts[key.strip()] = value.strip()
    
    # Extract server - IMPORTANT: parts.get('Server') returns the VALUE after 'Server='
    server_raw = parts.get('Server', '')
    
    # Clean the server name:
    # 1. Remove 'tcp:' prefix if present
    server = server_raw.replace('tcp:', '')
    # 2. Remove port (,1433) if present
    server = server.split(',')[0]
    # 3. Strip any whitespace
    server = server.strip()
    
    # Get database name
    database = parts.get('Initial Catalog') or parts.get('Database', '')
    database = database.strip()
    
    # Get credentials
    user = parts.get('User ID') or parts.get('UID', '')
    user = user.strip()
    
    password = parts.get('Password') or parts.get('PWD', '')
    password = password.strip()
    
    # Debug print
    print(f"Parsed components:")
    print(f"  Server: {server}")
    print(f"  Database: {database}")
    print(f"  User: {user}")
    print(f"  Password: {'*' * len(password)}")
    
    if not all([server, database, user, password]):
        raise ValueError(
            f"Missing required connection parameters.\n"
            f"  Server: {server or 'MISSING'}\n"
            f"  Database: {database or 'MISSING'}\n"
            f"  User: {user or 'MISSING'}\n"
            f"  Password: {'SET' if password else 'MISSING'}"
        )
    
    # URL encode the password and username to handle special characters
    password_encoded = urllib.parse.quote_plus(password)
    user_encoded = urllib.parse.quote_plus(user)
    
    # Build SQLAlchemy connection string using ODBC Driver 17
    connection_string = (
        f"mssql+pyodbc://{user_encoded}:{password_encoded}@{server}/{database}"
        f"?driver=ODBC+Driver+17+for+SQL+Server"
        f"&Encrypt=yes"
        f"&TrustServerCertificate=no"
        f"&Connection+Timeout=30"
    )
    
    return connection_string

# Convert the connection string
try:
    DATABASE_URL = parse_azure_connection_string(raw_connection_string)
    print(f"✅ Connecting to Azure SQL Database...")
    server_part = DATABASE_URL.split('@')[1].split('/')[0]
    db_part = DATABASE_URL.split('/')[-1].split('?')[0]
    print(f"   Server: {server_part}")
    print(f"   Database: {db_part}")
except Exception as e:
    print(f"❌ Error parsing connection string: {e}")
    print(f"   Raw connection string: {raw_connection_string[:80]}...")
    raise

# Create database engine
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=3600,
    echo=False
)

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for models
Base = declarative_base()

# Dependency function for FastAPI routes
def get_db():
    """Database session dependency for FastAPI"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()