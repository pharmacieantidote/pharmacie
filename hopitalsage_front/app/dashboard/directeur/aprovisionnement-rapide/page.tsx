'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';

interface ProduitFabricant {
  id: string;
  nom: string;
  fabricant_nom?: string;
}

interface User {
  id: number;
  username: string;
  role: string;
}

export default function AprovisionnementRapidePage() {
  const API = process.env.NEXT_PUBLIC_API_BASE_URL;
  const accessToken =
    typeof window !== 'undefined'
      ? localStorage.getItem('accessToken')
      : null;

  const [user, setUser] = useState<User | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [produits, setProduits] = useState<ProduitFabricant[]>([]);
  const [quantites, setQuantites] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const PAGE_SIZE = 20;

  /* =========================
     Charger utilisateur
  ========================== */
  useEffect(() => {
    if (!accessToken) return;

    axios
      .get(`${API}/api/user/me/`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      .then((res) => setUser(res.data))
      .catch(() => setUser(null));
  }, [accessToken]);

  /* =========================
     Recherche produits
  ========================== */
  useEffect(() => {
    if (!searchTerm.trim() || searchTerm.length < 2) {
      setProduits([]);
      return;
    }

    const delay = setTimeout(() => {
      setLoading(true);
      axios
        .get(
          `${API}/api/produits-fabricants/?search=${searchTerm}&page_size=${PAGE_SIZE}`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          }
        )
        .then((res) => {
          setProduits(res.data.results || []);
        })
        .catch(() => setProduits([]))
        .finally(() => setLoading(false));
    }, 400);

    return () => clearTimeout(delay);
  }, [searchTerm]);

  /* =========================
     Ajouter directement au stock
  ========================== */
  const ajouterAuStock = (produit: ProduitFabricant) => {
    const quantite = quantites[produit.id] || 1;

    axios
      .post(
        `${API}/api/stock/ajout-direct/`,
        {
          produit_fabricant_id: produit.id, // ⚠️ Correction ici
          quantite,
        },
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      )
      .then(() => {
        setMessage(`✅ ${produit.nom} ajouté au stock`);
        setTimeout(() => setMessage(''), 3000);
        setQuantites({ ...quantites, [produit.id]: 1 }); // reset quantité
      })
      .catch((err) => {
        console.error('Erreur API:', err.response?.data || err);
        alert("❌ Erreur lors de l'ajout au stock");
      });
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <h1 className="text-3xl font-bold text-green-700 mb-6">
        ⚡ Approvisionnement Rapide
      </h1>

      {message && (
        <div className="mb-4 bg-green-100 text-green-800 p-3 rounded">
          {message}
        </div>
      )}

      <div className="bg-white shadow rounded p-6">
        <input
          type="text"
          className="w-full p-3 border rounded mb-4"
          placeholder="🔍 Rechercher un médicament..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />

        {loading && <p className="text-gray-500">Chargement...</p>}

        {produits.length > 0 && (
          <div className="grid grid-cols-1 gap-4">
            {produits.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between border rounded p-4 hover:bg-gray-50"
              >
                <div>
                  <p className="font-semibold text-lg">{p.nom}</p>
                  <p className="text-sm text-gray-500">
                    Fabricant : {p.fabricant_nom || 'Non spécifié'}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={1}
                    className="w-20 p-2 border rounded"
                    value={quantites[p.id] || 1}
                    onChange={(e) =>
                      setQuantites({
                        ...quantites,
                        [p.id]: parseInt(e.target.value) || 1,
                      })
                    }
                  />

                  <button
                    onClick={() => ajouterAuStock(p)}
                    className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded"
                  >
                    ➕ Ajouter
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && searchTerm.length >= 2 && produits.length === 0 && (
          <p className="text-gray-500 mt-4">Aucun produit trouvé.</p>
        )}
      </div>
    </div>
  );
}
