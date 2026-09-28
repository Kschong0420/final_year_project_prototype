from fastapi import FastAPI
from .routes import router as api_router
from .realtime import router as websocket_router
from .store import Store
from .materials import router as materials_router
from .activities import router as activities_router
from .ai_generation import OllamaClient
from .adaptive import router as adaptive_router


def create_app():
    app = FastAPI(title="Adaptive Classroom - Milestone 5")
    app.state.store = Store()
    app.state.ai = OllamaClient()
    app.include_router(api_router)
    app.include_router(materials_router)
    app.include_router(activities_router)
    app.include_router(adaptive_router)
    app.include_router(websocket_router)
    return app


app = create_app()
