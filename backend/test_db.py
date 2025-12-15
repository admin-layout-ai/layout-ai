from app.database import engine, SessionLocal
from sqlalchemy import text

def test_connection():
    """Test database connection"""
    try:
        print("=" * 60)
        print("Testing Azure SQL Database Connection")
        print("=" * 60)
        
        # Test engine connection
        print("\n1. Testing engine connection...")
        with engine.connect() as conn:
            result = conn.execute(text("SELECT 1 AS test"))
            test_value = result.fetchone()[0]
            print(f"   ✅ Engine connection successful! (Test query returned: {test_value})")
        
        # Test session
        print("\n2. Testing session...")
        db = SessionLocal()
        result = db.execute(text("SELECT @@VERSION AS version"))
        version = result.fetchone()[0]
        print(f"   ✅ Session created successfully!")
        print(f"\n   SQL Server Version:")
        print(f"   {version[:150]}...")
        db.close()
        
        # Test database name
        print("\n3. Checking database...")
        db = SessionLocal()
        result = db.execute(text("SELECT DB_NAME() AS current_db"))
        current_db = result.fetchone()[0]
        print(f"   ✅ Connected to database: {current_db}")
        db.close()
        
        # List existing tables
        print("\n4. Listing existing tables...")
        db = SessionLocal()
        result = db.execute(text("""
            SELECT TABLE_NAME 
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_TYPE = 'BASE TABLE'
            ORDER BY TABLE_NAME
        """))
        tables = result.fetchall()
        if tables:
            print(f"   Found {len(tables)} table(s):")
            for table in tables:
                print(f"     - {table[0]}")
        else:
            print("   No tables found yet (this is expected for a new database)")
        db.close()
        
        print("\n" + "=" * 60)
        print("🎉 All database tests passed!")
        print("=" * 60)
        return True
        
    except Exception as e:
        print("\n" + "=" * 60)
        print("❌ Database connection failed!")
        print("=" * 60)
        print(f"\nError type: {type(e).__name__}")
        print(f"Error message: {str(e)}")
        
        # Additional debugging info
        print("\n" + "-" * 60)
        print("Debugging Information:")
        print("-" * 60)
        
        import os
        from dotenv import load_dotenv
        load_dotenv()
        
        conn_str = os.getenv('DATABASE_URL', '')
        if conn_str:
            # Don't print password
            safe_str = conn_str.split('Password=')[0] + 'Password=***'
            print(f"Connection string: {safe_str[:100]}...")
        else:
            print("DATABASE_URL not found in environment variables!")
        
        # Check ODBC drivers
        try:
            import pyodbc
            drivers = pyodbc.drivers()
            print(f"\nInstalled ODBC Drivers ({len(drivers)}):")
            for driver in drivers:
                print(f"  - {driver}")
            
            if 'ODBC Driver 18 for SQL Server' not in drivers:
                print("\n⚠️  WARNING: ODBC Driver 18 for SQL Server not found!")
                print("   Download from: https://go.microsoft.com/fwlink/?linkid=2249004")
        except ImportError:
            print("\n⚠️  pyodbc not installed")
        
        return False

if __name__ == "__main__":
    test_connection()