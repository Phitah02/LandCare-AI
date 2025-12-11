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


# Import routers
from routes.analysis import router as analysis_router
from routes.forecasting import router as forecasting_router

# Include routers with prefixes and tags
app.include_router(analysis_router, prefix="/api", tags=["Analysis"])
app.include_router(forecasting_router, prefix="/api/forecast", tags=["Forecasting"])


@app.get("/health", tags=["Health"])
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "gee_initialized": gee_initialized
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.debug,
        log_level="info"
    )