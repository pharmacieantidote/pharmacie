'use client';
import { useState, useEffect } from 'react';
import axios from 'axios';
import PharmacieLayout from '@/app/dashboard/directeur/layout';
import generateAndDownloadPDF from '@/components/RecuVentePDF';

interface Client {
  id: number;
  nom_complet: string;
  telephone: string;
}

interface ProduitPharmacie {
  id: number;
  nom_medicament: string;
  prix_vente: number;
  quantite: number;
  code_barre: string;
  localisation: string;
}

interface LigneVente {
  produit: ProduitPharmacie | null;
  quantite: number;
  prix_unitaire: number;
  total: number;
}

interface PharmacieData {
  id: number;
  nom_pharm: string;
  ville_pharm: string;
  commune_pharm: string;
  adresse_pharm: string;
  rccm: string;
  idnat: string;
  ni: string;
  telephone: string;
  logo_pharm: string | null;
}

export default function VentePage() {
  const [produits, setProduits] = useState<ProduitPharmacie[]>([]);
  const [pharmacieNom, setPharmacieNom] = useState<string | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [lignes, setLignes] = useState<LigneVente[]>([
    { produit: null, quantite: 1, prix_unitaire: 0, total: 0 },
  ]);
  const [searchTerm, setSearchTerm] = useState('');
  const [clientSearchTerm, setClientSearchTerm] = useState('');
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [pharmacieId, setPharmacieId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [pharmacieData, setPharmacieData] = useState<PharmacieData | null>(null);

  // 🔑 Charger le token JWT
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    setAccessToken(token);
  }, []);

  // 🏥 Charger les infos de la pharmacie liée à l'utilisateur
  useEffect(() => {
    if (accessToken) {
      axios
        .get(`${process.env.NEXT_PUBLIC_API_BASE_URL}/api/user/me/`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        .then((res) => {
          const pharmacie = res.data.pharmacie;
          if (pharmacie) {
            setPharmacieData(pharmacie);
            setPharmacieId(pharmacie.id);
            setPharmacieNom(pharmacie.nom_pharm);
          } else {
            setError('Aucune pharmacie trouvée pour cet utilisateur');
          }
        })
        .catch(() => setError('Erreur lors du chargement des données de la pharmacie'))
        .finally(() => setLoading(false));
    }
  }, [accessToken]);

  // 💊 Charger les produits
  const loadProduits = (pharmacieId: number) => {
    axios
      .get(
        `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/produits-pharmacie/?pharmacie=${pharmacieId}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
      .then((res) => setProduits(res.data))
      .catch(() => setError('Erreur lors du chargement des produits'));
  };

  // 👤 Charger les clients
  const loadClients = (pharmacieId: number) => {
    axios
      .get(
        `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/clients/?pharmacie=${pharmacieId}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
      .then((res) => setClients(res.data))
      .catch(console.error);
  };

  // Charger produits + clients quand la pharmacie est connue
  useEffect(() => {
    if (accessToken && pharmacieId) {
      loadProduits(pharmacieId);
      loadClients(pharmacieId);
    }
  }, [accessToken, pharmacieId]);

  // ➕ Ajouter une ligne
  const addLigne = () =>
    setLignes([...lignes, { produit: null, quantite: 1, prix_unitaire: 0, total: 0 }]);

  // ❌ Supprimer une ligne
  const removeLigne = (index: number) => {
    if (lignes.length > 1) {
      const copy = [...lignes];
      copy.splice(index, 1);
      setLignes(copy);
    }
  };

  // 🔄 Choisir un produit dans une ligne
  const updateLigneProduit = (index: number, produitId: number) => {
    const produit = produits.find((p) => p.id === produitId);
    if (!produit) return;
    const copy = [...lignes];
    copy[index] = {
      produit,
      quantite: 1,
      prix_unitaire: produit.prix_vente,
      total: produit.prix_vente * 1,
    };
    setLignes(copy);
  };

  // 🔢 Modifier la quantité d'une ligne
  const updateLigneQuantite = (index: number, quantite: number) => {
    const ligne = lignes[index];
    if (ligne.produit) {
      const copy = [...lignes];
      copy[index].quantite = quantite;
      copy[index].total = quantite * ligne.prix_unitaire;
      setLignes(copy);
    }
  };

  // 💰 Calcul du total
  const totalVente = lignes.reduce((s, l) => s + l.total, 0);

 // 🧾 Proformat
const handleProformat = () => {
  if (!selectedClient) {
    alert('Veuillez sélectionner un client pour générer le proformat.');
    return;
  }

  // ✅ CORRIGÉ : on ne filtre PAS par prix_unitaire > 0
  const lignesValides = lignes.filter(
    (l) => l.produit !== null && l.quantite > 0
  );

  if (lignesValides.length === 0) {
    alert('Aucun médicament valide sélectionné.');
    return;
  }

  // 🔥 Impression thermique
  if (accessToken) {
    axios.post(
      `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/imprimer-proformat/`,
      {
        client: selectedClient?.id || null,
        lignes: lignesValides.map((l) => ({
          produit: l.produit!.id,
          quantite: l.quantite,
          // ⚠️ On n'envoie PAS prix_unitaire → le backend l'injecte
        })),
      },
      { headers: { Authorization: `Bearer ${accessToken}` } }
    ).catch((err) => {
      console.error("Erreur impression proformat :", err);
      alert("Impossible d'imprimer le proformat sur l'imprimante thermique.");
    });
  }

  // 📄 Génération PDF (inchangée)
  generateAndDownloadPDF({
    lignes: lignesValides,
    selectedClient,
    totalVente: lignesValides.reduce((s, l) => s + l.total, 0),
    pharmacie: pharmacieData || {
      nom_pharm: 'Nom inconnu',
      ville_pharm: '',
      commune_pharm: '',
      adresse_pharm: '',
      rccm: '',
      idnat: '',
      ni: '',
      telephone: '',
      logo_pharm: null,
    },
    type: 'proformat',
  });
};

  // 💾 Soumission de la vente (côté API)
  const handleSubmit = async () => {
    if (!accessToken || !pharmacieId) return;

    for (const ligne of lignes) {
      if (!ligne.produit) continue;
      if (!ligne.quantite || ligne.quantite <= 0 || ligne.prix_unitaire <= 0 || ligne.total <= 0) {
        alert(
          `Veuillez saisir correctement la quantité et le prix du médicament '${ligne.produit.nom_medicament}'`
        );
        return;
      }
    }

    const payload = {
      pharmacie: pharmacieId,
      client: selectedClient?.id || null,
      lignes: lignes
        .filter((l) => l.produit !== null)
        .map((l) => ({
          produit: l.produit!.id,
          quantite: l.quantite,
        })),
    };

    try {
      await axios.post(`${process.env.NEXT_PUBLIC_API_BASE_URL}/api/ventes/`, payload, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      alert('Vente enregistrée avec succès !');
      // Impression côté serveur via Python ESC/POS (déjà dans ta vue)
      generateAndDownloadPDF({
        lignes,
        selectedClient,
        totalVente,
        pharmacie: pharmacieData || {
          nom_pharm: 'Nom inconnu',
          ville_pharm: '',
          commune_pharm: '',
          adresse_pharm: '',
          rccm: '',
          idnat: '',
          ni: '',
          telephone: '',
          logo_pharm: null,
        },
      });

      loadProduits(pharmacieId);
      setLignes([{ produit: null, quantite: 1, prix_unitaire: 0, total: 0 }]);
      setSelectedClient(null);
      setClientSearchTerm('');
    } catch (err: any) {
      alert('Erreur : ' + JSON.stringify(err.response?.data || err.message));
    }
  };

  if (loading) return <div className="p-6 text-center">Chargement...</div>;
  if (error) return <div className="p-6 text-red-500 text-center">{error}</div>;

  const filteredProduits = produits.filter((p) =>
    p.nom_medicament.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredClients = clients.filter(
    (c) =>
      c.nom_complet.toLowerCase().includes(clientSearchTerm.toLowerCase()) ||
      c.telephone.includes(clientSearchTerm)
  );

  return (
    <PharmacieLayout>
      <div className="p-6 bg-white rounded-xl shadow-md space-y-6">
        <h1 className="text-2xl font-bold">Nouvelle Vente</h1>

        <div className="grid md:grid-cols-2 gap-6">
          {/* COLONNE GAUCHE — Produits */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Produits</h2>
            <input
              type="text"
              placeholder="Rechercher un médicament..."
              className="w-full p-3 border rounded-lg"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <div className="grid md:grid-cols-1 gap-3 max-h-80 overflow-y-auto border rounded p-3 bg-gray-50">
                {filteredProduits.map((produit) => (
                  <div
                    key={produit.id}
                    className="border p-3 rounded-lg hover:bg-gray-50 cursor-pointer transition"
                    onClick={() => {
                      const dejaPris = lignes.some((l) => l.produit?.id === produit.id);
                      if (dejaPris) {
                        alert('Ce produit a déjà été sélectionné.');
                        return;
                      }
                      const emptyIndex = lignes.findIndex((l) => l.produit === null);
                      if (emptyIndex >= 0) {
                        updateLigneProduit(emptyIndex, produit.id);
                      } else {
                        setLignes([
                          ...lignes,
                          {
                            produit,
                            quantite: 1,
                            prix_unitaire: produit.prix_vente,
                            total: produit.prix_vente * 1,
                          },
                        ]);
                      }
                    }}
                  >
                    <div className="font-semibold">{produit.nom_medicament}</div>
                    <div className="text-sm text-gray-600">Stock : {produit.quantite}</div>
                    <div className="text-sm text-green-600 font-bold">{produit.prix_vente} Fc</div>
                    <div className="text-sm text-gray-500 italic">
                      Etagère N° : {produit.localisation}
                    </div>
                  </div>
                ))}
                {filteredProduits.length === 0 && (
                  <div className="text-center text-gray-500">Aucun produit trouvé</div>
                )}
              </div>
            )}
          </div>

          {/* COLONNE DROITE — Panier */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Panier</h2>

            {/* Sélection du client */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="text-md font-semibold mb-2">Client</h3>
              <input
                type="text"
                placeholder="Rechercher un client..."
                className="w-full p-3 border rounded-lg"
                value={clientSearchTerm}
                onChange={(e) => setClientSearchTerm(e.target.value)}
              />
              {selectedClient && (
                <div className="mt-2 p-3 bg-blue-50 rounded flex justify-between items-center">
                  <div>
                    <strong>{selectedClient.nom_complet}</strong>{' '}
                    <span className="text-gray-600 ml-3">{selectedClient.telephone}</span>
                  </div>
                  <button
                    className="text-red-500 hover:underline"
                    onClick={() => {
                      setSelectedClient(null);
                      setClientSearchTerm('');
                    }}
                  >
                    Changer
                  </button>
                </div>
              )}
              {!selectedClient && clientSearchTerm && (
                <div className="bg-white border rounded shadow mt-1 max-h-40 overflow-y-auto">
                  {filteredClients.map((client) => (
                    <div
                      key={client.id}
                      className="p-2 hover:bg-gray-100 cursor-pointer"
                      onClick={() => {
                        setSelectedClient(client);
                        setClientSearchTerm('');
                      }}
                    >
                      <div className="font-semibold">{client.nom_complet}</div>
                      <div className="text-sm text-gray-500">{client.telephone}</div>
                    </div>
                  ))}
                  {filteredClients.length === 0 && (
                    <div className="p-2 text-gray-500">Aucun client trouvé</div>
                  )}
                </div>
              )}
            </div>

            {/* Liste des lignes */}
            <div className="space-y-3">
              {lignes.map((ligne, index) => (
                <div
                  key={index}
                  className="grid grid-cols-1 gap-3 border p-3 rounded-lg bg-white shadow-sm"
                >
                  <select
                    className="p-2 border rounded"
                    value={ligne.produit?.id || ''}
                    onChange={(e) => updateLigneProduit(index, parseInt(e.target.value))}
                  >
                    <option value="">Choisir un produit</option>
                    {produits.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nom_medicament}
                      </option>
                    ))}
                  </select>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min="1"
                      className="p-2 border rounded w-20"
                      value={ligne.quantite}
                      onChange={(e) => updateLigneQuantite(index, parseInt(e.target.value))}
                    />
                    <div>P.U : {Number(ligne.prix_unitaire || 0).toFixed(2)} Fc</div>
                    <div>Total : {Number(ligne.total || 0).toFixed(2)} Fc</div>
                    <button
                      className="ml-auto text-red-500 hover:underline"
                      onClick={() => removeLigne(index)}
                    >
                      Supprimer
                    </button>
                  </div>
                </div>
              ))}
              <button className="text-blue-500 hover:underline" onClick={addLigne}>
                + Ajouter une ligne
              </button>
            </div>

            {/* TOTAL + Actions */}
            <div className="bg-emerald-50 border-t pt-4 p-4 rounded-lg">
              <div className="flex justify-between items-center mb-4">
                <div className="text-lg font-bold">
                  Total: {Number(totalVente).toFixed(2)} Fc
                </div>
              </div>
              <div className="flex justify-end gap-4">
                <button
                  className="bg-yellow-500 hover:bg-yellow-600 text-white font-semibold py-2 px-4 rounded"
                  onClick={handleProformat}
                >
                  Proformat
                </button>
                <button
                  className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
                  onClick={handleSubmit}
                >
                  Enregistrer Vente
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PharmacieLayout>
  );
}
