from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from .routers import projects, plans, payments, users
from .database import engine, Base
import os
import logging
from dotenv import load_dotenv
from datetime import datetime

load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Layout AI API",
    version="1.0.0",
    description="AI-powered floor plan generation for Australian builders"
)

# CORS - List all allowed origins explicitly (wildcards don't work!)
origins = [
    "http://localhost:3000",
    "http://localhost:3001",
    "https://layout-ai.com.au",
    "https://www.layout-ai.com.au",
    # Add your Azure Static Web Apps default domain here
    "https://red-rock-0a6966100.azurestaticapps.net",
]

# Also allow origins from environment variable for flexibility
extra_origins = os.getenv("ALLOWED_ORIGINS", "")
if extra_origins:
    origins.extend([o.strip() for o in extra_origins.split(",") if o.strip()])

logger.info(f"CORS allowed origins: {origins}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global error handlers
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    logger.error(f"Validation error: {exc.errors()}")
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "detail": exc.errors(),
            "message": "Validation error - please check your input"
        }
    )

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "message": "An internal error occurred. Please try again later.",
            "error": str(exc) if os.getenv("ENVIRONMENT") == "development" else "Internal server error"
        }
    )

# Include routers
app.include_router(users.router)
app.include_router(projects.router)
app.include_router(plans.router)
app.include_router(payments.router)

@app.get("/")
async def root():
    return {
        "message": "Layout AI API",
        "version": "1.0.0",
        "status": "running",
        "environment": os.getenv("ENVIRONMENT", "development")
    }

@app.get("/health")
async def health():
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}