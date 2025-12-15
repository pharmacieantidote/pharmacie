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




#################### IMPRESSION#######################################
#################### IMPRESSION #######################################
#################### IMPRESSION #######################################
from escpos.printer import Usb
from datetime import datetime
import random
import traceback

def imprimer_ticket_vente(vente, lignes):
    print(">>> Impression du ticket appelée pour la vente", vente.id)
    try:
        # 🔌 Connexion à l’imprimante USB
        printer = Usb(0x1fc9, 0x2016)

        pharmacie = vente.pharmacie
        client = vente.client

        # =====================================================
        # 🔹 CONFIGURATION GLOBALE (TAILLE DU TEXTE)
        # =====================================================
        # 👉 Pour diminuer toute la taille du ticket :
        #    width et height peuvent être mis à 0.8 ou 0.7
        printer.set(width=1, height=1)

        # =====================================================
        # 🏪 EN-TÊTE PHARMACIE
        # =====================================================
        date_vente = vente.date_vente.strftime('%d/%m/%Y %H:%M')

        # Première ligne : Bienvenue à gauche, date à droite
        printer.set(align='left', bold=False)
        printer.text(f"Bienvenue chez{'':<10}{date_vente:>20}\n")

        # Nom pharmacie en gras
        printer.set(bold=True)
        printer.text(f"{pharmacie.nom_pharm}\n")
        
       # Texte très petit en italique simulé
# Ultra petit texte (le plus petit possible sur ESC/POS)
        printer.set(font='b', width=1, height=1)
        printer.text("\x1B\x21\x01")  # Mode caractères condensés ESC/POS
        printer.text("(Votre Santé, notre priorité)\n")
        printer.text("\x1B\x21\x00")  # Retour au mode normal

        # Infos contact
        printer.set(bold=False)
        printer.text("Adresse: Av. Lunguvu, N°6, Q/Foir ")
        printer.text(f"C/: {pharmacie.adresse_pharm}\n")
        printer.text(f"Tel: {pharmacie.telephone}\n")
        printer.text("Pharmacien Grâce MUSAMFUR\n")

        # Mentions légales fixes
        printer.text("RCCM: KINM/RCCM/24-A-04269\n")
        printer.text("IDNAT: 01-g4701-N68946B\n")
        printer.text("NI: A2436650P\n")

        # Mention légale réduite et centrée
        printer.set(align='center', width=0.8, height=0.8, bold=False)
        printer.text("Les produits vendus ne sont\n")
        printer.text("ni repris, ni échangés.\n")
        printer.set(width=1, height=1)
        printer.text("-" * 32 + "\n")

        # =====================================================
        # 👤 CLIENT
        # =====================================================
        printer.set(align='left', bold=False)
        if client:
            printer.text(f"Client : {client.nom_complet}\n")
            if client.telephone:
                printer.text(f"Tél : {client.telephone}\n")
        else:
            printer.text("Client\n")

        printer.text("-" * 32 + "\n")

        # =====================================================
        # 🧾 FACTURE N° (ALÉATOIRE)
        # =====================================================
               # =====================================================
        # 🧾 FACTURE N° (ALÉATOIRE)
        # =====================================================
        numero_facture = random.randint(1000, 9999)
        printer.set(align='center', bold=True)
        printer.text(f"FACTURE N° {numero_facture}\n")
        printer.set(bold=False)
        printer.text("-" * 42 + "\n")

        # =====================================================
        # 💊 DÉTAIL DES PRODUITS
        # =====================================================
        printer.set(align='left', bold=True)
        printer.text(f"{'Produit':<18}|{'Qté':^5}|{'Prix':^9}|{'PT':^9}\n")
        printer.set(bold=False)
        printer.text("-" * 42 + "\n")

        total = 0
        for l in lignes:
            produit = l.produit.nom_medicament
            qte = l.quantite
            pu = float(l.prix_unitaire)
            sous_total = qte * pu
            total += sous_total

            # Tronquer le nom du produit si trop long
            nom_affiche = (produit[:18] + '..') if len(produit) > 18 else produit

            # Afficher les colonnes avec séparateurs |
            printer.text(f"{nom_affiche:<18}|{qte:^5}|{pu:>7.2f}Fc|{sous_total:>7.2f}Fc\n")

        printer.text("-" * 42 + "\n")

        # =====================================================
        # 💰 TOTAL
        # =====================================================
        printer.set(align='right', bold=True)
        printer.text(f"TOTAL : {total:.2f} Fc\n")
        printer.set(bold=False)
        printer.text("-" * 42 + "\n")

        # =====================================================
        # ⚠️ AVERTISSEMENT CLIENT
        # =====================================================
        printer.set(align='center')
        printer.text("Chers clients, veuillez vérifier vos\n")
        printer.text("produits à la livraison.\n")
        printer.text("-" * 32 + "\n")

        # =====================================================
        # 🙏 REMERCIEMENT
        # =====================================================
        printer.set(align='center', bold=True)
        printer.text("Merci pour votre paiement !\n")
        printer.set(bold=False)
        printer.text("À bientôt !\n\n\n")
        qr_content = f"Facture N° {numero_facture} - {pharmacie.nom_pharm}"
        printer.set(align='center')
        printer.qr(qr_content, size=6)
        printer.text("-" * 42 + "\n")

        # ✂️ Couper le papier
        printer.cut()
        printer.close()


        print(">>> Ticket imprimé avec succès ✅")

    except Exception as e:
        print(f"⚠️ Erreur impression ticket: {e}")
        traceback.print_exc()


################### proforma##################
from escpos.printer import Usb
import random
import traceback
from datetime import datetime

def imprimer_ticket_proformat(client, pharmacie, lignes):
    try:
        printer = Usb(0x1fc9, 0x2016)

        # ✅ Largeur standard 58mm = 32 colonnes max
        printer.set(width=1, height=1)

        # ========================
        # 🏪 EN-TÊTE
        # ========================
        date_now = datetime.now().strftime('%d/%m/%Y %H:%M')
        printer.set(align='left', bold=False)
        printer.text(f"Bienvenue chez\n")
        printer.text(f"{date_now:>32}\n")

        printer.set(bold=True)
        printer.text(f"{pharmacie.nom_pharm[:32]}\n")

        printer.set(bold=False, font='b')  # texte petit
        printer.text("(Votre Santé, notre priorité)\n")

        printer.text(f"Adresse: {pharmacie.adresse_pharm[:32]}\n")
        printer.text(f"Tel: {pharmacie.telephone[:32]}\n")
        printer.text("-" * 32 + "\n")

        # ========================
        # 👤 CLIENT
        # ========================
        if client:
            printer.text(f"Client: {client.nom_complet[:28]}\n")
            if client.telephone:
                printer.text(f"Tél: {client.telephone[:28]}\n")
        else:
            printer.text("Client: ---\n")
        printer.text("-" * 32 + "\n")

        # ========================
        # 🧾 PROFORMAT
        # ========================
        numero_proformat = random.randint(1000, 9999)
        printer.set(align='center', bold=True)
        printer.text(f"PROFORMAT N°{numero_proformat}\n")
        printer.set(bold=False)
        printer.text("-" * 32 + "\n")

        # ========================
        # 💊 DÉTAIL PRODUITS
        # ========================
        if not lignes:
            printer.text("⚠️ AUCUN PRODUIT\n")
            printer.text("-" * 32 + "\n")
        else:
            printer.set(align='left', bold=True)
            # 12 + 4 + 8 + 8 = 32
            printer.text(f"{'PRODUIT':<12}{'QTE':>4}{'P.U':>8}{'TOT':>8}\n")
            printer.set(bold=False)
            printer.text("-" * 32 + "\n")

            total = 0
            for l in lignes:
                nom = l["nom"][:12]
                qte = l["quantite"]
                pu = float(l["prix_unitaire"])
                sous_total = qte * pu
                total += sous_total
                printer.text(f"{nom:<12}{qte:>4}{pu:>8.0f}{sous_total:>8.0f}\n")

            printer.text("-" * 32 + "\n")

            # 💰 TOTAL
            printer.set(align='right', bold=True)
            printer.text(f"TOTAL: {total:.0f} Fc\n")
            printer.set(bold=False)
            printer.text("-" * 32 + "\n")

        # ========================
        # 📝 MESSAGE + QR
        # ========================
        printer.set(align='center')
        printer.text("Vérifiez vos produits\nà la livraison.\n")
        printer.text("-" * 32 + "\n")
        printer.text("Merci ! À bientôt !\n\n")

        # 🔲 QR Code (taille réduite pour fiabilité)
        qr_content = f"Proformat {numero_proformat} - {pharmacie.nom_pharm}"
        try:
            printer.qr(qr_content, size=4)  # size=4 → plus fiable que 6
        except Exception as qr_e:
            printer.text("QR: indisponible\n")
            print(f"⚠️ QR échoué: {qr_e}")

        printer.cut()
        printer.close()
        print("✅ Proformat imprimé avec succès")

    except Exception as e:
        print(f"❌ Erreur impression proformat: {e}")
        traceback.print_exc()

######################## Impression Commande de Produit#############################
from escpos.printer import Usb
from datetime import datetime
import traceback

def imprimer_commande_thermique(commande):
    """
    Impression thermique du BON DE COMMANDE (réception fournisseur)
    Corps : Produit | Qté cmd | Qté reçue (cases)
    """
    try:
        printer = Usb(0x1fc9, 0x2016)

        pharmacie = commande.pharmacie
        fabricant = commande.fabricant
        date_cmd = commande.date_commande.strftime("%d/%m/%Y %H:%M")

        # ==============================
        # 🏥 EN-TÊTE
        # ==============================
        printer.set(align='center', bold=True)
        printer.text("BON DE COMMANDE\n")
        printer.set(bold=False)
        printer.text("-" * 32 + "\n")

        printer.set(align='left')
        printer.text(f"Pharmacie : {pharmacie.nom_pharm}\n")
        printer.text(f"Date      : {date_cmd}\n")
        printer.text(f"Fabricant : {fabricant.nom}\n")
        printer.text("-" * 32 + "\n")

        # ==============================
        # 📦 CORPS (RÉCEPTION)
        # ==============================
        printer.set(bold=True)
        printer.text(f"{'Produit':<16}{'Cmd':>5}{'Rec'}\n")
        printer.set(bold=False)
        printer.text("-" * 32 + "\n")

        for ligne in commande.lignes.all():
            nom = ligne.produit_fabricant.nom[:16]
            qte_cmd = ligne.quantite_commandee

            # ⬜⬜⬜ = zone manuelle réception
            printer.text(f"{nom:<16}{qte_cmd:>5}   [   ]\n")

        printer.text("-" * 32 + "\n")

        # ==============================
        # ✍️ SIGNATURE / RÉCEPTION
        # ==============================
        printer.text("\nReçu par : _______________\n")
        printer.text("Date     : ____ / ____ / ____\n")

        printer.text("\n\n")
        printer.cut()
        printer.close()

    except Exception as e:
        traceback.print_exc()
        raise e


#########################-----Rapport Mensuel et Calcul Marge de Progretion ou regrestion----###############
# pharmacie/utils/finance_analysis.py
from datetime import datetime
from django.db.models import Sum
from django.db.models.functions import TruncMonth
from decimal import Decimal

from pharmacie.models import VenteProduit, Depense, RapportMensuel


def calculer_totaux_mensuels(pharmacie, annee, mois):
    """Calcule les ventes, dépenses et bénéfices d’un mois donné."""
    ventes = (
        VenteProduit.objects.filter(
            pharmacie=pharmacie,
            date_vente__year=annee,
            date_vente__month=mois
        )
        .aggregate(total_ventes=Sum("montant_total"))
    )["total_ventes"] or Decimal(0)

    depenses = (
        Depense.objects.filter(
            pharmacie=pharmacie,
            date_depense__year=annee,
            date_depense__month=mois
        )
        .aggregate(total_depenses=Sum("montant"))
    )["total_depenses"] or Decimal(0)

    benefice = ventes - depenses
    return ventes, depenses, benefice


def get_rapport_precedent(pharmacie, annee, mois):
    """Renvoie le rapport du mois précédent s’il existe."""
    if mois == 1:
        annee_prec, mois_prec = annee - 1, 12
    else:
        annee_prec, mois_prec = annee, mois - 1

    return RapportMensuel.objects.filter(
        pharmacie=pharmacie,
        annee=annee_prec,
        mois=mois_prec
    ).first()


def generer_rapport_mensuel(pharmacie, annee, mois):
    """Génère et enregistre un rapport mensuel complet."""
    ventes, depenses, benefice = calculer_totaux_mensuels(pharmacie, annee, mois)
    precedent = get_rapport_precedent(pharmacie, annee, mois)

    croissance_ventes = Decimal(0)
    croissance_benef = Decimal(0)

    if precedent:
        if precedent.total_ventes > 0:
            croissance_ventes = ((ventes - precedent.total_ventes) / precedent.total_ventes) * 100
        if precedent.total_benefice > 0:
            croissance_benef = ((benefice - precedent.total_benefice) / precedent.total_benefice) * 100

    rapport, created = RapportMensuel.objects.update_or_create(
        pharmacie=pharmacie,
        annee=annee,
        mois=mois,
        defaults={
            "total_ventes": ventes,
            "total_depenses": depenses,
            "total_benefice": benefice,
            "croissance_ventes": round(croissance_ventes, 2),
            "croissance_benefice": round(croissance_benef, 2),
        },
    )
    return rapport


def generer_rapports_pour_annee(pharmacie, annee=None):
    """Génère tous les rapports pour une année donnée (utile pour recalculer ou initialiser)."""
    if annee is None:
        annee = datetime.now().year

    for mois in range(1, 13):
        generer_rapport_mensuel(pharmacie, annee, mois)
