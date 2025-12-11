import asyncio
from concurrent.futures import ThreadPoolExecutor
from fastapi import APIRouter, HTTPException, Depends
from typing import Dict, Any

from models.schemas import UserCreate, UserLogin, TokenResponse, UserResponse
from auth.dependencies import get_current_user, create_access_token
from database import db

router = APIRouter()


async def authenticate_user_background(email: str, password: str) -> Dict[str, Any]:
    """Run user authentication in thread pool."""
    loop = asyncio.get_event_loop()
    with ThreadPoolExecutor() as executor:
        result = await loop.run_in_executor(executor, db.authenticate_user, email, password)
        return result


async def create_user_background(email: str, password: str) -> Dict[str, Any]:
    """Run user creation in thread pool."""
    loop = asyncio.get_event_loop()
    with ThreadPoolExecutor() as executor:
        result = await loop.run_in_executor(executor, db.create_user, email, password)
        return result


async def get_user_background(user_id: str) -> Dict[str, Any]:
    """Run user retrieval in thread pool."""
    loop = asyncio.get_event_loop()
    with ThreadPoolExecutor() as executor:
        result = await loop.run_in_executor(executor, db.get_user_by_id, user_id)
        return result


@router.post("/register", response_model=TokenResponse)
async def register(request: UserCreate):
    """Register a new user."""
    try:
        # Validate password length
        if len(request.password) < 6:
            raise HTTPException(status_code=400, detail="Password must be at least 6 characters long")

        # Check if user already exists
        if db.user_exists(request.email):
            raise HTTPException(status_code=409, detail="User already exists")

        # Create new user
        user = await create_user_background(request.email, request.password)
        if not user:
            raise HTTPException(status_code=500, detail="Failed to create user")

        # Generate token
        token = create_access_token({"user_id": str(user['id']), "email": user['email']})

        return TokenResponse(
            token=token,
            user=UserResponse(id=str(user['id']), email=user['email'])
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/login", response_model=TokenResponse)
async def login(request: UserLogin):
    """Authenticate user and return token."""
    try:
        # Authenticate user
        user = await authenticate_user_background(request.email, request.password)
        if not user:
            raise HTTPException(status_code=401, detail="Invalid email or password")

        # Generate token
        token = create_access_token({"user_id": str(user['id']), "email": user['email']})

        return TokenResponse(
            token=token,
            user=UserResponse(id=str(user['id']), email=user['email'])
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/me")
async def get_current_user_info(current_user: Dict[str, Any] = Depends(get_current_user)):
    """Get current user information."""
    try:
        user = await get_user_background(current_user['user_id'])
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        return {"user": UserResponse(id=user['id'], email=user['email'])}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))