# comptes/permissions.py
from rest_framework.permissions import BasePermission

class IsDirector(BasePermission):
    """
    Permission pour vérifier si l'utilisateur est un directeur
    """
    def has_permission(self, request, view):
        return (
            request.user and
            request.user.is_authenticated and
            getattr(request.user, 'role', None) == 'directeur'
        )
# comptes/permissions.py
from rest_framework.permissions import BasePermission
import logging

logger = logging.getLogger(__name__)

# comptes/permissions.py
from rest_framework.permissions import BasePermission
import logging

logger = logging.getLogger(__name__)

class IsAdminOrSuperuser(BasePermission):
    """
    Permission CORRIGÉE - version debug
    """
    def has_permission(self, request, view):
        user = request.user
        
        # 1. Vérifier l'authentification
        if not user or not user.is_authenticated:
            logger.error("❌ Permission: User not authenticated")
            return False
        
        # 2. DEBUG COMPLET
        logger.info("=" * 60)
        logger.info("🔍 DEBUG IsAdminOrSuperuser PERMISSION")
        logger.info(f"User: {user.username} (ID: {user.id})")
        
        # 3. Récupérer le rôle avec différentes méthodes
        role_direct = getattr(user, 'role', None)
        role_via_dict = user.__dict__.get('role', None) if hasattr(user, '__dict__') else None
        role_method = user.role if hasattr(user, 'role') else None
        
        logger.info(f"Role (direct): '{role_direct}'")
        logger.info(f"Role (via dict): '{role_via_dict}'")
        logger.info(f"Role (method): '{role_method}'")
        logger.info(f"Role type: {type(role_direct)}")
        logger.info(f"is_superuser: {user.is_superuser}")
        logger.info(f"is_staff: {user.is_staff}")
        
        # 4. Vérifications étape par étape
        check1 = role_direct == 'admin'
        check2 = str(role_direct).strip().lower() == 'admin'
        check3 = user.is_superuser
        
        logger.info(f"Check 1 (role == 'admin'): {check1}")
        logger.info(f"Check 2 (role stripped/lower == 'admin'): {check2}")
        logger.info(f"Check 3 (is_superuser): {check3}")
        
        # 5. Résultat final
        result = check1 or check2 or check3
        
        logger.info(f"Final result: {result}")
        logger.info("=" * 60)
        
        return result