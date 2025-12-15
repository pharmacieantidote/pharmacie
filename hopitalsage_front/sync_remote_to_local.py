import os
import sys
import json
from uuid import UUID
from datetime import datetime, timezone as dt_timezone

from django.db import models, transaction
from django.utils import timezone

# ============================
# DJANGO SETUP
# ============================
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.append(BASE_DIR)
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "gestion_pharmacie.settings")

import django
django.setup()

from comptes.models import Pharmacie, User
from pharmacie.models import (
    TauxChange,
    Fabricant,
    ProduitFabricant,
    ProduitPharmacie,
    LotProduitPharmacie,
    CommandeProduit,
    CommandeProduitLigne,
    ReceptionProduit,
    ReceptionLigne,
    Client,
    VenteProduit,
    VenteLigne,
    ClientPurchase,
    MedicalExam,
    Prescription,
    RendezVous,
    Requisition,
    PublicitePharmacie,
    Depense,
)

# ============================
# CONFIGURATION
# ============================
BATCH_SIZE = 500

MODELS_GLOBAL = [
    TauxChange,
    Fabricant,
    ProduitFabricant,
    Pharmacie,
    PublicitePharmacie,
]

MODELS_PAR_PHARMACIE = [
    ProduitPharmacie,
    LotProduitPharmacie,
    CommandeProduit,
    CommandeProduitLigne,
    ReceptionProduit,
    ReceptionLigne,
    Client,
    VenteProduit,
    VenteLigne,
    ClientPurchase,
    MedicalExam,
    Prescription,
    RendezVous,
    Requisition,
    Depense,
]

PHARMACIE_LOOKUP = {
    "ProduitPharmacie": "pharmacie",
    "LotProduitPharmacie": "produit__pharmacie",
    "CommandeProduit": "pharmacie",
    "CommandeProduitLigne": "commande__pharmacie",
    "ReceptionProduit": "commande__pharmacie",
    "ReceptionLigne": "reception__commande__pharmacie",
    "Client": "pharmacie",
    "VenteProduit": "pharmacie",
    "VenteLigne": "vente__pharmacie",
    "ClientPurchase": "client__pharmacie",
    "MedicalExam": "client__pharmacie",
    "Prescription": "client__pharmacie",
    "RendezVous": "pharmacie",
    "Requisition": "pharmacie",
    "Depense": "pharmacie",
}

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
SYNC_FILE = os.path.join(CURRENT_DIR, "last_sync.json")
CONFIG_FILE = os.path.join(CURRENT_DIR, "pharmacie_config.json")

# ============================
# SYNC TIME MANAGEMENT
# ============================
def load_sync_times():
    if not os.path.exists(SYNC_FILE):
        return {}
    with open(SYNC_FILE, "r") as f:
        return json.load(f)

def save_sync_times(data):
    with open(SYNC_FILE, "w") as f:
        json.dump(data, f, indent=2)

SYNC_TIMES = load_sync_times()

def get_last_sync(model, direction):
    raw = SYNC_TIMES.get(f"{model.__name__}_{direction}")
    if raw:
        dt = datetime.fromisoformat(raw)
        return dt if timezone.is_aware(dt) else timezone.make_aware(dt)
    return datetime.min.replace(tzinfo=dt_timezone.utc)

def update_last_sync(model, direction):
    SYNC_TIMES[f"{model.__name__}_{direction}"] = timezone.now().isoformat()

# ============================
# UTILS
# ============================
USER_CACHE = set()

def ensure_user_local(user_id, source_db):
    if user_id in USER_CACHE:
        return

    if not User.objects.filter(id=user_id).exists():
        ru = User.objects.using(source_db).get(id=user_id)
        User.objects.create(
            id=ru.id,
            username=ru.username,
            email=ru.email,
            password=ru.password,
            is_active=ru.is_active,
            is_staff=ru.is_staff,
            is_superuser=ru.is_superuser,
            last_login=ru.last_login,
            date_joined=ru.date_joined,
        )
    USER_CACHE.add(user_id)

def get_current_pharmacie():
    with open(CONFIG_FILE, "r") as f:
        pid = json.load(f)["pharmacie_id"]
    return Pharmacie.objects.get(id=UUID(pid))

def ensure_pharmacie_remote(pharmacie, db):
    Pharmacie.objects.using(db).update_or_create(
        id=pharmacie.id,
        defaults={
            f.name: getattr(pharmacie, f.name)
            for f in Pharmacie._meta.fields
            if f.name != "id"
        },
    )

def chunked_queryset(qs):
    last_pk = None
    while True:
        page = qs
        if last_pk:
            page = page.filter(pk__gt=last_pk)
        page = page.order_by("pk")[:BATCH_SIZE]

        batch = list(page)
        if not batch:
            break

        yield batch
        last_pk = batch[-1].pk

# ============================
# CORE SYNC (SAFE MULTI-DB)
# ============================
def sync_model(source_db, target_db, model, pharmacie=None):
    direction = f"{source_db}→{target_db}"
    print(f"\n🔄 {model.__name__} [{direction}]")

    qs = model.objects.using(source_db)

    lookup = PHARMACIE_LOOKUP.get(model.__name__)
    if pharmacie and lookup:
        qs = qs.filter(**{lookup: pharmacie})

    if hasattr(model, "updated_at"):
        qs = qs.filter(updated_at__gt=get_last_sync(model, direction))

    total_synced = 0

    for batch in chunked_queryset(qs):
        ids = [obj.pk for obj in batch]

        existing = {
            obj.pk: obj
            for obj in model.objects.using(target_db).filter(pk__in=ids)
        }

        to_create = []
        to_update = []

        for obj in batch:
            data = {}

            for field in model._meta.fields:
                if field.name == "id":
                    continue

                if isinstance(field, models.ForeignKey):
                    # IMPORTANT: FK via ID uniquement
                    data[field.attname] = getattr(obj, field.attname)

                    # Gestion FK User
                    if field.remote_field.model == User:
                        user_id = getattr(obj, field.attname)
                        if user_id:
                            ensure_user_local(user_id, source_db)
                else:
                    data[field.name] = getattr(obj, field.name)

            if obj.pk in existing:
                target = existing[obj.pk]

                if hasattr(model, "updated_at") and target.updated_at >= obj.updated_at:
                    continue

                for k, v in data.items():
                    setattr(target, k, v)

                to_update.append(target)
            else:
                to_create.append(model(id=obj.pk, **data))

        with transaction.atomic(using=target_db):
            if to_create:
                model.objects.using(target_db).bulk_create(
                    to_create, batch_size=BATCH_SIZE
                )
            if to_update:
                model.objects.using(target_db).bulk_update(
                    to_update,
                    fields=[f.name for f in model._meta.fields if f.name != "id"],
                    batch_size=BATCH_SIZE,
                )

        total_synced += len(to_create) + len(to_update)
        print(f"   ✔ {total_synced} synchronisés")

    update_last_sync(model, direction)

# ============================
# MAIN
# ============================
def run():
    pharmacie = get_current_pharmacie()
    print(f"🏥 Pharmacie : {pharmacie.nom_pharm}")

    print("\n=== 🔼 LOCAL → REMOTE ===")
    for m in MODELS_GLOBAL:
        sync_model("default", "remote", m)

    ensure_pharmacie_remote(pharmacie, "remote")

    for m in MODELS_PAR_PHARMACIE:
        sync_model("default", "remote", m, pharmacie)

    print("\n=== 🔽 REMOTE → LOCAL ===")
    for m in MODELS_GLOBAL:
        sync_model("remote", "default", m)

    for m in MODELS_PAR_PHARMACIE:
        sync_model("remote", "default", m, pharmacie)

    save_sync_times(SYNC_TIMES)
    print("\n✅ Synchronisation terminée avec succès.")

if __name__ == "__main__":
    run()
