from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status
from rest_framework_simplejwt.tokens import RefreshToken
from .serializers import LoginSerializer,UserSerializer
from django.contrib.auth import authenticate

class LoginAPIView(APIView):
    def post(self, request, *args, **kwargs):
        serializer = LoginSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.validated_data

            # Générer les tokens JWT
            refresh = RefreshToken.for_user(user)
            access_token = str(refresh.access_token)
            refresh_token = str(refresh)

            # Renvoyer les tokens et les informations utilisateur
            return Response({
                'token': access_token,
                'refresh': refresh_token,
                'user': {
                    'id': user.id,
                    'username': user.username,
                    'role': user.role,
                    'first_name': user.first_name,
                    'last_name': user.last_name,
                    'email': user.email,
                }
            }, status=status.HTTP_200_OK)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

########################### SUPERUSER ADMINISTRATEUR DE TOUT LE SYSTEME###########################
from rest_framework import viewsets, permissions
from .models import Pharmacie, User
from .serializers import PharmacieSerializer, UserSerializer
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from .models import Pharmacie, User
from .serializers import PharmacieSerializer, UserSerializer
from rest_framework.views import APIView

# views.py
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import Pharmacie
from .serializers import PharmacieSerializer
from rest_framework.permissions import IsAuthenticated

class PharmacieViewSet(viewsets.ModelViewSet):
    queryset = Pharmacie.objects.all()
    serializer_class = PharmacieSerializer
    permission_classes = [IsAuthenticated]

    @action(detail=True, methods=['post'])
    def activer(self, request, pk=None):
        pharmacie = self.get_object()
        pharmacie.is_active = True
        pharmacie.save()
        return Response({'status': 'pharmacie activée'}, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'])
    def desactiver(self, request, pk=None):
        pharmacie = self.get_object()
        pharmacie.is_active = False
        pharmacie.save()
        return Response({'status': 'pharmacie désactivée'}, status=status.HTTP_200_OK)

class UserProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = UserSerializer(request.user, context={'request': request})
        return Response(serializer.data)

class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        role = self.request.query_params.get('role')
        pharmacie_id = self.request.query_params.get('pharmacie')
        queryset = User.objects.all()
        if role:
            queryset = queryset.filter(role=role)
        if pharmacie_id:
            queryset = queryset.filter(pharmacie_id=pharmacie_id)
        return queryset

# views.py
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from .serializers import UpdateProfileSerializer

class UpdateProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request):
        serializer = UpdateProfileSerializer(request.user, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response({"message": "Profil mis à jour avec succès"}, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

############# Aciver et desactivé le USER ADMIN#############""
# views.py

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from .models import User
from .serializers import AdminUserSerializer


@api_view(['GET'])
@permission_classes([IsAdminUser])
def liste_admins(request):
    admins = User.objects.filter(role='admin')
    serializer = AdminUserSerializer(admins, many=True)
    return Response(serializer.data)


from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from django.contrib.auth import get_user_model

User = get_user_model()

@api_view(['PATCH'])
@permission_classes([IsAdminUser])
def desactiver_utilisateur(request, user_id):
    try:
        user = User.objects.get(id=user_id, role='admin')
        user.is_active = False
        user.save()
        return Response({'success': True, 'message': f"{user.username} désactivé avec succès."})
    except User.DoesNotExist:
        return Response({'success': False, 'error': 'Utilisateur non trouvé ou non admin'}, status=404)


@api_view(['PATCH'])
@permission_classes([IsAdminUser])
def reactiver_utilisateur(request, user_id):
    try:
        user = User.objects.get(id=user_id, role='admin')
        user.is_active = True
        user.save()
        return Response({'success': True, 'message': f"{user.username} réactivé avec succès."})
    except User.DoesNotExist:
        return Response({'success': False, 'error': 'Utilisateur non trouvé ou non admin'}, status=404)


from rest_framework import generics, permissions, status
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from .models import User, Pharmacie
from .serializers import UserSerializer  # Assurez-vous d'importer correctement

class CreateDirectorView(generics.CreateAPIView):
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated] 

    def post(self, request, pharmacie_id):
        pharmacie = get_object_or_404(Pharmacie, id=pharmacie_id)
        username = request.data.get('username')
        password = request.data.get('password')
        first_name = request.data.get('first_name')
        last_name = request.data.get('last_name')

        if not all([username, password]):
            return Response({"error": "Nom d'utilisateur et mot de passe requis"}, status=status.HTTP_400_BAD_REQUEST)

        # Création de l'utilisateur avec le rôle 'directeur' et la pharmacie
        user = User.objects.create_user(
            username=username,
            password=password,
            first_name=first_name,
            last_name=last_name,
            pharmacie=pharmacie,
            role='directeur'
        )

        serializer = self.get_serializer(user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

########################dashboard directeur#############"
# comptes/views.py
from rest_framework import generics
from .models import Pharmacie, User
from .serializers import PharmacieSerializer

class PharmacieDetailView(generics.RetrieveAPIView):
    serializer_class = PharmacieSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        # Récupère la pharmacie liée au Directeur
        return self.request.user.pharmacie

from rest_framework import viewsets, permissions
from .models import User
from .serializers import UsercomptableSerializer,ComptableDashboardSerializer

class IsDirecteur(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user and request.user.is_authenticated and request.user.role == 'directeur'

class ComptableUserViewSet(viewsets.ModelViewSet):
    serializer_class = UsercomptableSerializer
    permission_classes = [IsAuthenticated, IsDirecteur]

    def get_queryset(self):
        # Le directeur peut voir les comptables de sa pharmacie
        return User.objects.filter(role='comptable', pharmacie=self.request.user.pharmacie)

    def perform_create(self, serializer):
        serializer.save()

################################### le Comptable ###################""
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status

class DashboardComptableAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user

        if user.role != 'comptable':
            return Response({'detail': "Accès non autorisé."}, status=status.HTTP_403_FORBIDDEN)

        # Exemple de données du dashboard comptable
        data = {
            'message': f"Bienvenue {user.first_name}, voici votre tableau de bord comptable.",
            'total_depenses': 120000,
            'total_recettes': 180000,
            'solde': 60000,
        }

        serializer = ComptableDashboardSerializer(data=data)
        serializer.is_valid()
        return Response(serializer.data)

# views.py
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from .serializers import RegisterAdminSerializer,  AdminUserDetailSerializer

class RegisterAdminView(APIView):
    def post(self, request, *args, **kwargs):
        serializer = RegisterAdminSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            return Response({
                "message": "Administrateur créé avec succès",
                "user": {
                    "id": user.id,
                    "username": user.username,
                    "email": user.email,
                    "role": user.role
                }
            }, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    

# views.py
from rest_framework import generics
from rest_framework.permissions import IsAuthenticated, IsAdminUser

class PharmacieUsersAdminAPIView(generics.ListAPIView):
    serializer_class = AdminUserDetailSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        pharmacie_id = self.kwargs['pharmacie_id']
        return User.objects.filter(pharmacie_id=pharmacie_id)

# views.py
# views.py
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404
from comptes.models import User

from comptes.permissions import IsAdminOrSuperuser

class ToggleUserActiveAPIView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrSuperuser]

    def post(self, request, user_id):
        # Vérifier que l'utilisateur connecté a les permissions
        if not request.user.is_staff and not request.user.is_superuser:
            return Response(
                {"detail": "You do not have permission to perform this action."},
                status=403
            )
        
        # Récupérer l'utilisateur cible
        target_user = get_object_or_404(User, id=user_id)
        
        # Empêcher un admin de se désactiver lui-même
        if target_user.id == request.user.id:
            return Response(
                {"detail": "You cannot deactivate your own account."},
                status=400
            )
        
        # Basculer le statut
        target_user.is_active = not target_user.is_active
        target_user.save()
        
        return Response({
            "is_active": target_user.is_active,
            "message": f"User {'activated' if target_user.is_active else 'deactivated'} successfully"
        })
    



# comptes/views.py ou pharmacie/views.py
import logging
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404
from comptes.models import User
from comptes.permissions import IsAdminOrSuperuser

logger = logging.getLogger(__name__)

class DesactiverUserAPIView(APIView):
    """
    Vue pour DÉSACTIVER un utilisateur
    """
    permission_classes = [IsAuthenticated, IsAdminOrSuperuser]

    def post(self, request, user_id):
        logger.info(f"=== DesactiverUserAPIView ===")
        logger.info(f"Request user: {request.user.username} (ID: {request.user.id})")
        
        # 1. Récupérer l'utilisateur cible
        target_user = get_object_or_404(User, id=user_id)
        logger.info(f"Target user: {target_user.username} (ID: {target_user.id})")
        
        # 2. Empêcher de se désactiver soi-même
        if target_user.id == request.user.id:
            logger.warning(f"User tried to deactivate themselves")
            return Response(
                {"detail": "You cannot deactivate your own account."},
                status=400
            )
        
        # 3. Empêcher de désactiver un superuser (sauf si on est superuser)
        if target_user.is_superuser and not request.user.is_superuser:
            logger.warning(f"Non-superuser tried to deactivate a superuser")
            return Response(
                {"detail": "Only superusers can deactivate other superusers."},
                status=403
            )
        
        # 4. Désactiver l'utilisateur
        logger.info(f"Before: is_active = {target_user.is_active}")
        target_user.is_active = False
        target_user.save()
        logger.info(f"After: is_active = {target_user.is_active}")
        
        logger.info(f"=== User deactivated successfully ===")
        
        return Response({
            "id": str(target_user.id),
            "username": target_user.username,
            "is_active": target_user.is_active,
            "message": "User deactivated successfully"
        })


class ReactiverUserAPIView(APIView):
    """
    Vue pour RÉACTIVER un utilisateur
    """
    permission_classes = [IsAuthenticated, IsAdminOrSuperuser]

    def post(self, request, user_id):
        logger.info(f"=== ReactiverUserAPIView ===")
        logger.info(f"Request user: {request.user.username} (ID: {request.user.id})")
        
        # 1. Récupérer l'utilisateur cible
        target_user = get_object_or_404(User, id=user_id)
        logger.info(f"Target user: {target_user.username} (ID: {target_user.id})")
        
        # 2. Réactiver l'utilisateur
        logger.info(f"Before: is_active = {target_user.is_active}")
        target_user.is_active = True
        target_user.save()
        logger.info(f"After: is_active = {target_user.is_active}")
        
        logger.info(f"=== User reactivated successfully ===")
        
        return Response({
            "id": str(target_user.id),
            "username": target_user.username,
            "is_active": target_user.is_active,
            "message": "User activated successfully"
        })







class DeleteUserAPIView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrSuperuser]

    def delete(self, request, user_id):
        user = get_object_or_404(User, id=user_id)
        user.delete()
        return Response({"message": "Utilisateur supprimé"})
