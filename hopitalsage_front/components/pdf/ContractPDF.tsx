"use client";

import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: {
    paddingTop: 50,
    paddingLeft: 40,
    paddingRight: 40,
    fontFamily: "Helvetica",
    fontSize: 11,
    color: "#333",
    position: "relative",
    border: "1.5pt solid #d97a4f",
    borderRadius: 10,
  },

  // Bandeau supérieur
  topBanner: {
    position: "absolute",
    top: 0,
    width: "100%",
    height: 30,
    backgroundColor: "#d97a4f",
  },

  // WATERMARK (logo centré)
  watermark: {
    position: "absolute",
    top: "35%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    width: 350,
    height: 350,
    opacity: 0.07,
  },

  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 55,
    marginTop: 30,
  },

  senderBlock: {
    color: "#d97a4f",
    lineHeight: 1.2,
  },

  logoSmall: {
    width: 70,
    height: 70,
  },

  rightHeaderBlock: {
    textAlign: "right",
    fontSize: 11,
    lineHeight: 1.2,
  },

  dateLine: {
    textAlign: "right",
    marginTop: -20,
    marginBottom: 25,
  },

  objectBlock: {
    marginBottom: 30,
  },
  objectTitle: {
    fontWeight: "bold",
    marginBottom: 4,
  },
  objectSub: {
    color: "#d97a4f",
  },

  paragraph: {
    marginBottom: 10,
    lineHeight: 1.25,
    textAlign: "justify",
  },

  signature: {
    marginTop: 40,
    textAlign: "right",
  },

  signatureName: {
    marginTop: 35,
    fontWeight: "bold",
  },

  qrCode: {
    width: 70,
    height: 70,
    position: "absolute",
    bottom: 50,
    right: 40,
  },

  footer: {
    position: "absolute",
    bottom: 20,
    width: "100%",
    textAlign: "center",
    fontSize: 10,
    color: "#d97a4f",
  },
  footerRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 18,
  },
});

export default function ContractPDF({ pharmacie, qrCode }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>

        {/* BANDEAU SUPÉRIEUR */}
        <View style={styles.topBanner}></View>

        {/* WATERMARK CENTRÉ */}
        <Image src="/nicapharm.png" style={styles.watermark} />

        {/* HEADER */}
        <View style={styles.topRow}>

          {/* Expéditeur */}
          <View style={styles.senderBlock}>
            <Text>Nicatech</Text>
            <Text>28, Av. de Victoire</Text>
            <Text>KALAMU, RDC</Text>
          </View>

          {/* Logo + coordonnées */}
          <View style={{ alignItems: "flex-end" }}>
            <Image src="/nicapharm.png" style={styles.logoSmall} />
            <View style={styles.rightHeaderBlock}>
              <Text>NICATECH SARL</Text>
              <Text>Kinshasa, RDC</Text>
              <Text>Tél : +243 856 693 433</Text>
            </View>
          </View>
        </View>

        {/* DATE */}
        <Text style={styles.dateLine}>
          Kinshasa, le {new Date().toLocaleDateString("fr-FR")}
        </Text>

        {/* OBJET */}
        <View style={styles.objectBlock}>
          <Text style={styles.objectTitle}>Objet : Contrat d’abonnement NICAPHARM SOFT</Text>
          <Text style={styles.objectSub}>Lettre contractuelle</Text>
        </View>

        {/* CONTENU DU CONTRAT */}
        <Text style={styles.paragraph}>
          Le présent contrat est conclu entre NICATECH, ci-après « le Fournisseur », et la pharmacie
          « {pharmacie.nom_pharm} », située à {pharmacie.adresse_pharm}, {pharmacie.ville_pharm},
          ci-après « le Client ».
        </Text>

        <Text style={styles.paragraph}>
          Le Fournisseur accorde au Client une licence d’utilisation du logiciel NICAPHARM SOFT pour la gestion
          intégrale de sa pharmacie.
        </Text>

        <Text style={styles.paragraph}>
          <Text style={{ fontWeight: "bold" }}>Frais uniques :</Text> 50 USD pour activation, configuration et formation.
        </Text>

        <Text style={styles.paragraph}>
          <Text style={{ fontWeight: "bold" }}>Frais mensuels :</Text> {pharmacie.montant_mensuel} USD, exigibles chaque mois
          jusqu’au {pharmacie.date_expiration}.
        </Text>

        <Text style={styles.paragraph}>
          Tout retard supérieur à 7 jours entraîne la suspension du service.
        </Text>

        <Text style={styles.paragraph}>
          Le Client s’interdit de reproduire ou revendre le logiciel.
        </Text>

        <Text style={styles.paragraph}>
          Les données restent la propriété du Client. Le Fournisseur les sauvegarde quotidiennement.
        </Text>

        <Text style={styles.paragraph}>
          Tout litige relève des tribunaux de Kinshasa.
        </Text>

        {/* SIGNATURE */}
        <View style={styles.signature}>
          <Text>Cordialement,</Text>
          <Text style={styles.signatureName}>Pour NICATECH</Text>
        </View>

        {/* QR CODE */}
        {qrCode && <Image src={qrCode} style={styles.qrCode} />}

        {/* FOOTER */}
        <View style={styles.footer}>
          <View style={styles.footerRow}>
            <Text>📞 +243 856 693 433</Text>
            <Text>📧 contact@nicatech.com</Text>
          </View>
        </View>

      </Page>
    </Document>
  );
}
