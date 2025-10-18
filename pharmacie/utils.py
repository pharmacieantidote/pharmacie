# pharmacie/utils/inventory_analysis.py
"""
Analyse et gestion des stocks pour la pharmacie :
- Ventes, réceptions et rotation des produits
- Catégorisation ABC
- Estimation du stock et recommandations d’achat
- Détection des produits inactifs ou en rupture
"""

from decimal import Decimal, ROUND_HALF_UP
from datetime import timedelta, date
from collections import OrderedDict
from django.db.models import Sum, F, Value, Q, Min, Max, DecimalField
from django.db.models.functions import Coalesce, TruncMonth
from django.utils import timezone

from pharmacie.models import (
    ProduitPharmacie,
    VenteLigne,
    VenteProduit,
    ReceptionLigne,
    ReceptionProduit,
    CommandeProduitLigne,
)

# ============================================================
# 🔧 UTILITAIRES
# ============================================================

def _quantize(value, places="0.01"):
    """Arrondir proprement les décimaux."""
    return Decimal(value).quantize(Decimal(places), rounding=ROUND_HALF_UP)

# ============================================================
# 📊 AGRÉGATIONS
# ============================================================

def aggregate_sales(pharmacie, period_days=30, by_value=False):
    """
    Agrège les ventes sur une période donnée.
    Retourne un dict : {produit_id: {...}}
    """
    end = timezone.now()
    start = end - timedelta(days=period_days)

    qs = (
        VenteLigne.objects
        .filter(vente__pharmacie=pharmacie, vente__date_vente__range=(start, end))
        .select_related('produit')
    )

    agg = qs.values('produit').annotate(
        sold_qty=Coalesce(Sum('quantite'), Value(0), output_field=DecimalField()),
        total_value=Coalesce(Sum(F('total')), Value(0), output_field=DecimalField()),
    )

    produits = ProduitPharmacie.objects.filter(id__in=[a['produit'] for a in agg])
    prod_map = {str(p.id): p for p in produits}

    result = {}
    for a in agg:
        pid = str(a['produit'])
        result[pid] = {
            'produit': prod_map.get(pid),
            'sold_qty': Decimal(a['sold_qty'] or 0),
            'sold_value': Decimal(a['total_value'] or 0),
        }

    return result


def aggregate_received(pharmacie, period_days=None):
    """
    Total reçu par produit.
    Retourne : {produit_pharmacie_id: total_recu}
    """
    qs = (
        ReceptionLigne.objects
        .select_related('ligne_commande', 'reception', 'ligne_commande__produit_fabricant')
        .filter(reception__commande__pharmacie=pharmacie)
    )

    if period_days:
        end = timezone.now()
        start = end - timedelta(days=period_days)
        qs = qs.filter(reception__date_reception__range=(start, end))

    totals = {}
    for r in qs:
        pf = r.ligne_commande.produit_fabricant
        if pf:
            totals[str(pf.id)] = totals.get(str(pf.id), 0) + int(r.quantite_recue or 0)

    result = {}
    produits_ph = ProduitPharmacie.objects.filter(pharmacie=pharmacie).select_related('produit_fabricant')
    for ph in produits_ph:
        pf_id = str(ph.produit_fabricant.id) if ph.produit_fabricant else None
        result[str(ph.id)] = Decimal(totals.get(pf_id, 0))

    return result

# ============================================================
# ⏳ ESTIMATION TEMPS EN PHARMACIE
# ============================================================

def estimate_time_in_pharmacy(pharmacie, produit_obj, period_days=365):
    """Estime le temps moyen qu’un produit passe dans la pharmacie."""
    pf = produit_obj.produit_fabricant
    if not pf:
        return None

    end = timezone.now()
    start = end - timedelta(days=period_days)

    rec_qs = ReceptionLigne.objects.filter(
        reception__commande__pharmacie=pharmacie,
        reception__date_reception__range=(start, end),
        ligne_commande__produit_fabricant=pf
    )

    sale_qs = VenteLigne.objects.filter(
        vente__pharmacie=pharmacie,
        vente__date_vente__range=(start, end),
        produit=produit_obj
    )

    if not rec_qs.exists() or not sale_qs.exists():
        return None

    avg_rec = sum(r.reception.date_reception.timestamp() for r in rec_qs) / rec_qs.count()
    avg_sale = sum(s.vente.date_vente.timestamp() for s in sale_qs) / sale_qs.count()
    avg_days = (avg_sale - avg_rec) / (24 * 3600)

    return Decimal(avg_days).quantize(Decimal('0.1')) if avg_days >= 0 else None

# ============================================================
# 🧠 MÉTRIQUES ET CATÉGORISATION ABC
# ============================================================

def compute_metrics(pharmacie, period_days=30, by_value=False, abc_thresholds=(80, 95)):
    """
    Calcule les métriques de performance par produit :
    - Quantités vendues, reçues, en stock
    - % de contribution
    - Catégorisation ABC
    """
    sales = aggregate_sales(pharmacie, period_days, by_value)
    received = aggregate_received(pharmacie)
    total_global = sum(v['sold_value'] if by_value else v['sold_qty'] for v in sales.values()) or Decimal('0')

    items = []
    for pid, v in sales.items():
        prod = v['produit']
        if not prod:
            continue

        sold_qty = v['sold_qty'] or Decimal('0')
        sold_value = v['sold_value'] or Decimal('0')
        received_qty = received.get(str(prod.id), Decimal(0))
        stock_current = Decimal(prod.quantite or 0)
        percent = (sold_value / total_global * 100) if by_value else (sold_qty / total_global * 100)
        avg_daily = sold_qty / Decimal(period_days) if period_days > 0 else Decimal('0')
        time_in_pharm = estimate_time_in_pharmacy(pharmacie, prod)

        items.append({
            'produit': prod,
            'produit_id': str(prod.id),
            'nom': prod.nom_medicament,
            'sold_qty': sold_qty,
            'sold_value': sold_value,
            'received_qty': received_qty,
            'stock_current': stock_current,
            'percent': _quantize(percent),
            'avg_daily': _quantize(avg_daily),
            'time_in_pharm': time_in_pharm,
        })

    # Classement
    items.sort(key=lambda x: x['sold_value'] if by_value else x['sold_qty'], reverse=True)

    # Catégorisation ABC
    cum = Decimal('0')
    A_limit, B_limit = map(Decimal, abc_thresholds)
    output = []
    for it in items:
        cum += it['percent']
        if cum <= A_limit:
            cat = 'A'
        elif cum <= B_limit:
            cat = 'B'
        else:
            cat = 'C'

        days_of_stock = (it['stock_current'] / it['avg_daily']).quantize(Decimal('0.1')) if it['avg_daily'] > 0 else None
        output.append({**it, 'categorie': cat, 'days_of_stock': days_of_stock})

    return output

# ============================================================
# 📦 RECOMMANDATIONS DE COMMANDE
# ============================================================

def recommend_order_qty(produit_obj, avg_daily, lead_time_days=14, safety_days=7, target_cover_days=30, rounding_unit=1):
    """Calcule la quantité à recommander pour le produit."""
    avg_daily = Decimal(avg_daily or 0)
    current = Decimal(produit_obj.quantite or 0)
    reorder_level = avg_daily * Decimal(lead_time_days + safety_days)
    desired_stock = avg_daily * Decimal(target_cover_days)
    qty_needed = max(desired_stock - current, 0)

    if rounding_unit > 1:
        units = (qty_needed / Decimal(rounding_unit)).quantize(0, rounding=ROUND_HALF_UP)
        qty_to_order = units * Decimal(rounding_unit)
    else:
        qty_to_order = qty_needed.quantize(Decimal('1'), rounding=ROUND_HALF_UP)

    return int(qty_to_order)

# ============================================================
# 🚨 FLAGS ET STATUTS
# ============================================================

def flags_for_product(item, expire_threshold_days=90, low_stock_days_threshold=7):
    """Retourne les drapeaux (alerte, péremption, lenteur, etc.) du produit."""
    p = item['produit']
    flags = []

    if p.date_peremption and (p.date_peremption - date.today()).days <= expire_threshold_days:
        flags.append('péremption_proche')
    if p.quantite <= p.alerte_quantite:
        flags.append('alerte_quantite')
    if item.get('days_of_stock') and Decimal(item['days_of_stock']) <= Decimal(low_stock_days_threshold):
        flags.append('rupture_rapide_possible')
    if item.get('categorie') == 'A':
        flags.append('rotation_rapide')
    if item.get('categorie') == 'C':
        flags.append('rotation_lente')
    if item.get('time_in_pharm') and item['time_in_pharm'] > Decimal(90):
        flags.append('stock_ancien')

    return flags

# ============================================================
# 📄 RAPPORT GLOBAL
# ============================================================

def generate_report(pharmacie, period_days=30, by_value=False, **kwargs):
    """
    Génère le rapport complet d’analyse de stock.
    """
    metrics = compute_metrics(pharmacie, period_days, by_value)
    report = []
    today = timezone.now().date()

    for item in metrics:
        prod = item['produit']
        qty_reco = recommend_order_qty(prod, item['avg_daily'], **kwargs)
        flags = flags_for_product(item)

        statut = "OK"
        if 'alerte_quantite' in flags or 'rupture_rapide_possible' in flags:
            statut = "⚠️ Rupture fréquente"
        elif 'rotation_rapide' in flags:
            statut = "🚀 Rotation rapide"
        elif 'rotation_lente' in flags:
            statut = "🐢 Rotation lente"
        elif 'péremption_proche' in flags or 'stock_ancien' in flags:
            statut = "⏳ Péremption/Stock ancien"

        last_sale = VenteLigne.objects.filter(vente__pharmacie=pharmacie, produit=prod)\
            .order_by('-vente__date_vente').values_list('vente__date_vente', flat=True).first()

        days_since_last_sale = (today - last_sale.date()).days if last_sale else None
        first_entry = getattr(prod, 'date_entree', None)
        time_in_pharm_days = (today - first_entry).days if first_entry else None

        report.append({
            'produit_id': item['produit_id'],
            'nom': item['nom'],
            'quantite_achetee': int(item['received_qty']),
            'quantite_vendue': int(item['sold_qty']),
            'quantite_restante': int(item['stock_current']),
            'taux_rotation_pct': float((item['sold_qty'] / (item['received_qty'] or 1)) * 100) if item['received_qty'] > 0 else 0.0,
            'contribution_vente_pct': float(item['percent']),
            'categorie': item['categorie'],
            'avg_daily': float(item['avg_daily']),
            'days_of_stock': float(item['days_of_stock']) if item['days_of_stock'] is not None else None,
            'last_sale_date': str(last_sale.date()) if last_sale else None,
            'days_since_last_sale': days_since_last_sale,
            'time_in_pharm_days': time_in_pharm_days,
            'statut': statut,
            'flags': flags,
            'suggestion_commande': qty_reco,
        })

    return report

# ============================================================
# 🔄 ROTATION RÉELLE DES PRODUITS
# ============================================================

def analyse_rotation_reelle(pharmacie, period_days=180):
    """
    Analyse la rotation réelle des produits :
    Compare la date de commande et les ventes.
    """
    end = timezone.now()
    start = end - timedelta(days=period_days)

    commandes = (
        CommandeProduitLigne.objects
        .filter(commande__pharmacie=pharmacie, commande__date_commande__range=(start, end))
        .select_related('produit_fabricant')
    )

    resultats = []
    today = timezone.now().date()

    for cmd in commandes:
        pf = cmd.produit_fabricant
        prod = ProduitPharmacie.objects.filter(pharmacie=pharmacie, produit_fabricant=pf).first()
        if not prod:
            continue

        date_commande = cmd.commande.date_commande
        ventes = VenteLigne.objects.filter(vente__pharmacie=pharmacie, produit=prod)

        premiere_vente = ventes.aggregate(Min('vente__date_vente'))['vente__date_vente__min']
        derniere_vente = ventes.aggregate(Max('vente__date_vente'))['vente__date_vente__max']

        delai_rotation = (premiere_vente.date() - date_commande).days if premiere_vente else None
        temps_inactif = (today - derniere_vente.date()).days if derniere_vente else None

        if not derniere_vente:
            statut = "❌ Jamais vendu"
        elif temps_inactif > 60:
            statut = "💤 Produit mort"
        elif temps_inactif > 30:
            statut = "⚠️ Vente lente"
        else:
            statut = "✅ Actif"

        resultats.append({
            'produit': prod.nom_medicament,
            'quantite_restante': prod.quantite,
            'date_commande': str(date_commande),
            'premiere_vente': str(premiere_vente.date()) if premiere_vente else None,
            'derniere_vente': str(derniere_vente.date()) if derniere_vente else None,
            'delai_rotation_jours': delai_rotation,
            'temps_inactif_jours': temps_inactif,
            'statut': statut,
        })

    return resultats

# ============================================================
# 📅 ANALYSE SAISONNIÈRE
# ============================================================

def seasonal_analysis(pharmacie, produit_obj=None, months_back=12, by_value=False):
    """
    Analyse saisonnière des ventes (par mois).
    """
    end = timezone.now()
    start = end - timedelta(days=30 * months_back)

    qs = VenteLigne.objects.filter(vente__pharmacie=pharmacie, vente__date_vente__range=(start, end))
    if produit_obj:
        qs = qs.filter(produit=produit_obj)

    agg_field = Sum('total') if by_value else Sum('quantite')
    monthly_qs = (
        qs.annotate(month=TruncMonth('vente__date_vente'))
        .values('month')
        .annotate(total=Coalesce(agg_field, Value(0)))
        .order_by('month')
    )

    monthly = [{'month': row['month'].date(), 'total': Decimal(row['total'] or 0)} for row in monthly_qs if row['month']]
    totals = [m['total'] for m in monthly]

    avg_monthly = sum(totals) / Decimal(len(totals)) if totals else Decimal('0')
    max_month = max(totals) if totals else Decimal('0')
    multiplier = (max_month / avg_monthly) if avg_monthly > 0 else Decimal('0')

    return {
        'monthly': monthly,
        'avg_monthly': float(avg_monthly.quantize(Decimal('0.01'))),
        'max_month': float(max_month),
        'multiplier': float(_quantize(multiplier)),
    }

# ============================================================
# 🕓 DERNIÈRE VENTE
# ============================================================

def last_sale_info(pharmacie, produit_obj):
    """
    Retourne la dernière vente et le nombre de jours écoulés.
    """
    last_sale = (
        VenteLigne.objects
        .filter(vente__pharmacie=pharmacie, produit=produit_obj)
        .aggregate(last_date=Max('vente__date_vente'))
        ['last_date']
    )

    if not last_sale:
        return {'last_sale_date': None, 'days_since_last_sale': None}

    days_since = (timezone.now().date() - last_sale.date()).days
    return {'last_sale_date': last_sale.date(), 'days_since_last_sale': days_since}
