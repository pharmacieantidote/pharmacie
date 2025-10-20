'use client';

import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';

interface RecuVentePDFProps {
  lignes: any[];
  selectedClient: any;
  totalVente: number;
  pharmacie: any;
  type?: 'recu' | 'proformat';
}

const generateAndDownloadPDF = async ({
  lignes,
  selectedClient,
  totalVente,
  pharmacie,
  type = 'recu',
}: RecuVentePDFProps) => {
  console.log('📄 Génération du PDF (sans impression)');

  const margeTop = 5;
  const headerHeight = 40;
  const footerHeight = 30;

  let contenuHauteur = 0;
  lignes.forEach((ligne) => {
    if (ligne.produit) {
      const produitNom = ligne.produit.nom_medicament;
      const docTest = new jsPDF({ unit: 'mm' });
      const split = docTest.splitTextToSize(produitNom, 28);
      const blocHeight = split.length * 4 + 2;
      contenuHauteur += blocHeight;
    }
  });

  const totalHeight = margeTop + headerHeight + contenuHauteur + footerHeight + 50;
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [80, totalHeight],
  });

  let yPos = margeTop;

  // === En-tête pharmacie ===
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text(`${pharmacie?.nom_pharm || 'PHARMACIE'}`, 5, yPos);
  yPos += 4;

  // 🔥 VALEURS FIXES
  const RCCM = 'KINM/RCCM/24-A-04269';
  const IdNat = '01-g4701-N68946B';
  const NI = 'A2436650P';

  doc.setFont('helvetica', 'normal');
  doc.text(`RCCM: ${RCCM}`, 5, yPos);
  yPos += 4;
  doc.text(`IDNAT: ${IdNat}`, 5, yPos);
  yPos += 4;
  doc.text(`NI: ${NI}`, 5, yPos);
  yPos += 4;

  const today = new Date();
  const day = String(today.getDate()).padStart(2, '0');
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const year = today.getFullYear();
  const formattedDate = `${day}/${month}/${year}`;

  doc.text(`${pharmacie?.telephone || 'N/A'}`, 5, yPos);
  doc.text(`Date: ${formattedDate}`, 75, yPos, { align: 'right' });
  yPos += 4;

  doc.line(5, yPos, 75, yPos);
  yPos += 3;

  // === Titre ===
  const randomId = Math.random().toString(36).substring(2, 7).toUpperCase();
  const numero = (type === 'recu' ? 'REC' : 'PRO') + '-' + randomId;
  const titre = type === 'recu' ? 'Reçu de Paiement' : 'Facture Proformat';

  doc.setFont('bold');
  doc.text(`${titre} n° ${numero}`, 40, yPos, { align: 'center' });
  yPos += 6;

  // === Client ===
  doc.setFont('normal');
  doc.setFontSize(6);
  doc.text(`Client: ${selectedClient?.nom_complet || 'Non spécifié'}`, 5, yPos);
  yPos += 4;
  doc.line(5, yPos, 75, yPos);
  yPos += 3;

  // === Tableau ===
  doc.setFont('bold');
  doc.text('Produit', 5, yPos);
  doc.text('Qté', 35, yPos, { align: 'center' });
  doc.text('PU', 55, yPos, { align: 'center' });
  doc.text('PTotal', 75, yPos, { align: 'right' });
  yPos += 3;

  doc.setFont('normal');
  doc.setFontSize(5);

  lignes.forEach((ligne) => {
    if (ligne.produit) {
      const nomProduit = ligne.produit.nom_medicament;
      const produitSplit = doc.splitTextToSize(nomProduit, 28);
      const lineHeight = 3.5;
      const blocHeight = produitSplit.length * lineHeight;

      doc.text(produitSplit, 5, yPos);

      const yCol = yPos + blocHeight - lineHeight;
      doc.text(`${ligne.quantite}`, 35, yCol, { align: 'center' });
      doc.text(`${Number(ligne.prix_unitaire).toFixed(2)} Fc`, 55, yCol, { align: 'center' });
      doc.text(`${Number(ligne.total).toFixed(2)} Fc`, 75, yCol, { align: 'right' });

      yPos += blocHeight + 2;
    }
  });

  // === Total ===
  yPos += 2;
  doc.setFont('bold');
  doc.setFontSize(6);
  doc.text(`Montant Total: ${totalVente.toFixed(2)} Fc`, 5, yPos);

  const tauxDollar = 2900;
  const totalUSD = (totalVente / tauxDollar).toFixed(2);
  yPos += 4;
  doc.text(`Soit : $${totalUSD} USD`, 5, yPos);

  // === Bas de page ===
  yPos += 5;
  doc.setFont('italic');
  doc.setFontSize(5);
  doc.text('Les produits vendus ne sont ni repris, ni échangés', 40, yPos, { align: 'center' });

  yPos += 5;
  doc.text('Adresse: Lunguvu n°6, quartier Foire, commune de Lemba', 40, yPos, { align: 'center' });
  yPos += 5;
  doc.text('Pharmacien Grâce MUSANFUR', 40, yPos, { align: 'center' });

  yPos += 5;
  doc.setFont('bold');
  doc.setFontSize(7);
  doc.text('Merci pour votre paiement !', 40, yPos, { align: 'center' });

  // === QR Code ===
  yPos += 8;
  const qrData = `${titre} ${numero} | ${selectedClient?.nom_complet || 'Client'} | Total: ${totalVente.toFixed(2)} Fc`;
  const qrDataUrl = await QRCode.toDataURL(qrData);
  doc.addImage(qrDataUrl, 'PNG', 30, yPos, 20, 20);

  // ✅ Télécharger le PDF (sans impression)
  doc.save(`${titre.replace(' ', '_')}_${numero}.pdf`);
};

export default generateAndDownloadPDF;