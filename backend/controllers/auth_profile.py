
from fastapi import APIRouter, Depends

from ..auth import get_current_profile
from ..models import Profile

router = APIRouter(prefix="/auth", tags=["Autenticação"])


@router.get("/me")
async def get_me(
    profile: Profile = Depends(get_current_profile),
):
    return {
        "id": str(profile.id),
        "role": profile.role.value,
        "nome_completo": profile.nome_completo,
    }
