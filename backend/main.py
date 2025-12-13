import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config.settings import settings
from gee_processor import initialize_gee

# Global variable to track GEE initialization
gee_initialized = False


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for FastAPI application."""
    global gee_initialized

    # Startup
    print("Initializing Google Earth Engine...")
    try:
        gee_initialized = initialize_gee()
        if gee_initialized:
            print("Google Earth Engine initialized successfully")
        else:
            print("Warning: Google Earth Engine initialization failed")
    except Exception as e:
        print(f"Error initializing Google Earth Engine: {e}")
        gee_initialized = False

    yield

    # Shutdown
    print("Shutting down application...")


# Create FastAPI application
app = FastAPI(
    title=settings.app_name,
    debug=settings.debug,
    lifespan=lifespan
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=[
        "Authorization",
        "Content-Type",
        "X-Requested-With",
        "Accept",
        "Accept-Encoding",
        "Accept-Language",
        "Cache-Control",
        "Connection",
        "Host",
        "Origin",
        "Referer",
        "User-Agent"
    ],
)


# Ensure CORS headers are present even when an exception or upstream error occurs
@app.middleware("http")
async def ensure_cors_headers(request, call_next):
    try:
        response = await call_next(request)
    except Exception as e:
        # Build a minimal response for unexpected errors so we can attach CORS headers
        from fastapi.responses import JSONResponse
        response = JSONResponse(status_code=500, content={"detail": "Internal Server Error"})

    # Add Access-Control-Allow-Origin if missing
    origin = request.headers.get("origin")
    allowed = settings.cors_origins or []
    if origin and origin in allowed:
        response.headers.setdefault("Access-Control-Allow-Origin", origin)
    else:
        # Fallback to wildcard only if no specific origin matched
        response.headers.setdefault("Access-Control-Allow-Origin", "*")

    response.headers.setdefault("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH")
    response.headers.setdefault("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Requested-With, Accept, Accept-Encoding, Accept-Language, Cache-Control, Connection, Host, Origin, Referer, User-Agent")
    response.headers.setdefault("Access-Control-Allow-Credentials", "true")

    return response


# Import routers
from routes.analysis import router as analysis_router
from routes.forecasting import router as forecasting_router
from routes.auth import router as auth_router
from routes.weather import router as weather_router
from routes.historical import router as historical_router
from routes.models import router as models_router
from routes.tasks import router as tasks_router
from routes.utility import router as utility_router

# Include routers with prefixes and tags
app.include_router(analysis_router, tags=["Analysis"])
app.include_router(forecasting_router, prefix="/api/forecast", tags=["Forecasting"])
app.include_router(auth_router, prefix="/auth", tags=["Authentication"])
app.include_router(weather_router, tags=["Weather"])
app.include_router(historical_router, prefix="/historical", tags=["Historical"])
app.include_router(models_router, prefix="/api/models", tags=["Models"])
app.include_router(tasks_router, tags=["Tasks"])
app.include_router(utility_router, tags=["Utility"])


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.debug,
        log_level="info"
    )