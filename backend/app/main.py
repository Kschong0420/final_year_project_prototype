from fastapi import FastAPI
from .routes import router as api_router
from .realtime import router as websocket_router
from .store import Store


def create_app():
    app = FastAPI(title="Adaptive Classroom - Milestone 2")
    app.state.store = Store()
    app.include_router(api_router)
    app.include_router(websocket_router)
    return app


app = create_app()
