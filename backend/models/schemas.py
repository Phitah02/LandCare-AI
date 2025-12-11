from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from datetime import datetime


class Geometry(BaseModel):
    type: str = Field(..., example="Polygon")
    coordinates: List[List[List[float]]] = Field(..., description="GeoJSON coordinates")


class Centroid(BaseModel):
    lat: float
    lon: float


class AnalysisRequest(BaseModel):
    geometry: Geometry
    centroid: Optional[Centroid] = None


class VegetationIndex(BaseModel):
    NDVI: Optional[float] = None
    EVI: Optional[float] = None
    SAVI: Optional[float] = None


class LandCover(BaseModel):
    class_name: Optional[str] = None
    confidence: Optional[float] = None


class WeatherData(BaseModel):
    temperature: Optional[float] = None
    humidity: Optional[float] = None
    precipitation: Optional[float] = None
    description: Optional[str] = None


class SlopeData(BaseModel):
    average_slope: Optional[float] = None
    max_slope: Optional[float] = None


class RiskAssessment(BaseModel):
    overall_risk: Optional[str] = None
    risk_score: Optional[float] = None
    factors: Optional[Dict[str, Any]] = None


class AnalysisResponse(BaseModel):
    ndvi: Optional[VegetationIndex] = None
    evi: Optional[VegetationIndex] = None
    savi: Optional[VegetationIndex] = None
    land_cover: Optional[LandCover] = None
    slope: Optional[SlopeData] = None
    weather: Optional[WeatherData] = None
    area_hectares: Optional[float] = None
    risk_assessment: Optional[RiskAssessment] = None
    error: Optional[str] = None


class ForecastRequest(BaseModel):
    geometry: Geometry
    months: int = Field(12, le=12, ge=1)


class ForecastValue(BaseModel):
    values: List[float]
    upper_bound: List[float]
    lower_bound: List[float]


class ForecastResponse(BaseModel):
    forecast_dates: List[str]
    temperature: Optional[ForecastValue] = None
    precipitation: Optional[ForecastValue] = None
    humidity: Optional[ForecastValue] = None
    metadata: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


class UserCreate(BaseModel):
    email: str = Field(..., description="User email address")
    password: str = Field(..., min_length=6, description="Password (minimum 6 characters)")


class UserLogin(BaseModel):
    email: str
    password: str


class UserResponse(BaseModel):
    id: str
    email: str


class TokenResponse(BaseModel):
    token: str
    user: UserResponse


class HealthResponse(BaseModel):
    status: str
    gee_initialized: bool


class GeocodeRequest(BaseModel):
    place_name: str


class GeocodeResponse(BaseModel):
    lat: float
    lon: float
    display_name: str
    boundingbox: List[str]


class HistoricalVISRequest(BaseModel):
    geometry: Geometry
    start_date: Optional[str] = None
    end_date: Optional[str] = None


class HistoricalData(BaseModel):
    dates: List[str]
    ndvi_values: Optional[List[float]] = None
    evi_values: Optional[List[float]] = None
    savi_values: Optional[List[float]] = None
    metadata: Optional[Dict[str, Any]] = None
    cached: Optional[bool] = None
    cache_timestamp: Optional[str] = None


class WeatherForecastRequest(BaseModel):
    lat: float
    lon: float
    days: int = Field(5, le=16, ge=1)


class VegetationForecastRequest(BaseModel):
    geometry: Geometry
    periods: List[int] = Field(default=[3, 6, 12])
    use_fallback: bool = True


class TaskStatusResponse(BaseModel):
    task_id: str
    status: str
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    start_time: Optional[float] = None
    end_time: Optional[float] = None
    duration: Optional[float] = None