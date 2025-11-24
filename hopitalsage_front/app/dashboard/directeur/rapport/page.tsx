'use client';

import { useEffect, useState } from 'react';
import {
  Loader2,
  BarChart3,
  TrendingUp,
  DollarSign,
  ArrowUp,
  ArrowDown,
  Calendar,
} from 'lucide-react';
import { motion } from 'framer-motion';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LabelList,
} from 'recharts';

interface RapportMensuel {
  id: string;
  pharmacie_nom: string;
  annee: number;
  mois: number;
  mois_nom: string;
  total_ventes: number;
  total_depenses: number;
  total_benefice: number;
  croissance_ventes: number;
  croissance_benefice: number;
  cree_le: string;
}

export default function RapportMensuelPage() {
  const [annee, setAnnee] = useState(new Date().getFullYear());
  const [rapports, setRapports] = useState<RapportMensuel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  // Charger les rapports
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      setError('❌ Vous devez être connecté.');
      return;
    }

    setLoading(true);
    fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/api/rapports/?annee=${annee}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Erreur ${res.status}`);
        const data = await res.json();
        setRapports(data);
        setError(null);
      })
      .catch(() => setError('⚠️ Impossible de charger les rapports.'))
      .finally(() => setLoading(false));
  }, [annee]);

  // Générer un nouveau rapport
  const handleGenerate = async () => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      setError('❌ Vous devez être connecté.');
      return;
    }

    setGenerating(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/api/rapports/generer/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ annee }),
      });

      if (!res.ok) throw new Error('Erreur lors de la génération');
      const data = await res.json();

      // Mise à jour locale
      setRapports((prev) => {
        const updated = [...prev, data.rapport];
        return updated.sort((a, b) => a.mois - b.mois);
      });
      setError(null);
    } catch (err) {
      setError('⚠️ Échec de la génération du rapport.');
    } finally {
      setGenerating(false);
    }
  };

  // Calcul du total pourcentage par colonne
  const totalVentes = rapports.reduce((sum, r) => sum + r.total_ventes, 0);
  const totalDepenses = rapports.reduce((sum, r) => sum + r.total_depenses, 0);
  const totalBenefices = rapports.reduce((sum, r) => sum + r.total_benefice, 0);

  return (
    <div className="p-6 space-y-6">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
          <BarChart3 className="text-green-600" /> Rapports Mensuels
        </h2>

        <div className="flex items-center gap-3">
          <select
            value={annee}
            onChange={(e) => setAnnee(Number(e.target.value))}
            className="border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            {[2024, 2025, 2026].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>

          <button
            onClick={handleGenerate}
            disabled={generating}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-all"
          >
            {generating ? <Loader2 className="animate-spin w-5 h-5" /> : <Calendar className="w-5 h-5" />}
            Générer rapport
          </button>
        </div>
      </div>

      {/* TABLEAU DES DONNÉES */}
      {loading ? (
        <div className="flex justify-center items-center h-40">
          <Loader2 className="w-8 h-8 animate-spin text-green-600" />
        </div>
      ) : error ? (
        <div className="text-red-600 font-semibold">{error}</div>
      ) : rapports.length === 0 ? (
        <div className="text-gray-500 text-center italic">Aucun rapport trouvé pour {annee}.</div>
      ) : (
        <>
          {/* TABLEAU */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="overflow-x-auto"
          >
            <table className="w-full border-collapse bg-white rounded-2xl shadow-md overflow-hidden">
              <thead className="bg-green-100 text-gray-700">
                <tr>
                  <th className="py-3 px-4 text-left">Mois</th>
                  <th className="py-3 px-4 text-left">Ventes (Fc)</th>
                  <th className="py-3 px-4 text-left">Dépenses (Fc)</th>
                  <th className="py-3 px-4 text-left">Bénéfice (Fc)</th>
                  <th className="py-3 px-4 text-left">Croissance ventes</th>
                  <th className="py-3 px-4 text-left">Croissance bénéfice</th>
                </tr>
              </thead>
              <tbody>
                {rapports.map((r) => (
                  <tr key={r.id} className="border-b hover:bg-gray-50 transition-colors duration-200">
                    <td className="py-3 px-4 font-semibold">{r.mois_nom}</td>
                    <td className="py-3 px-4">
                      {Number(r.total_ventes).toLocaleString()} Fc{' '}
                      <span className="text-gray-400 text-xs">
                        ({((r.total_ventes / totalVentes) * 100).toFixed(1)}%)
                      </span>
                    </td>
                    <td className="py-3 px-4 text-red-600">
                      {Number(r.total_depenses).toLocaleString()} Fc{' '}
                      <span className="text-gray-400 text-xs">
                        ({((r.total_depenses / totalDepenses) * 100).toFixed(1)}%)
                      </span>
                    </td>
                    <td className="py-3 px-4 text-green-600 font-semibold">
                      {Number(r.total_benefice).toLocaleString()} Fc{' '}
                      <span className="text-gray-400 text-xs">
                        ({((r.total_benefice / totalBenefices) * 100).toFixed(1)}%)
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <TrendIndicator value={r.croissance_ventes} />
                    </td>
                    <td className="py-3 px-4">
                      <TrendIndicator value={r.croissance_benefice} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </motion.div>

          {/* GRAPHIQUES */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mt-10 bg-white p-6 rounded-2xl shadow-lg"
          >
            <h3 className="text-2xl font-semibold mb-6 text-gray-700 flex items-center gap-2">
              <TrendingUp className="text-green-500" /> Analyse Graphique
            </h3>

            <div className="w-full h-[450px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rapports} margin={{ top: 20, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="mois_nom" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="total_ventes" fill="#16a34a" name="Ventes">
                    <LabelList dataKey="total_ventes" position="top" formatter={(v) => v.toLocaleString()} />
                  </Bar>
                  <Bar dataKey="total_depenses" fill="#dc2626" name="Dépenses">
                    <LabelList dataKey="total_depenses" position="top" formatter={(v) => v.toLocaleString()} />
                  </Bar>
                  <Bar dataKey="total_benefice" fill="#0ea5e9" name="Bénéfice">
                    <LabelList dataKey="total_benefice" position="top" formatter={(v) => v.toLocaleString()} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </motion.div>
        </>
      )}
    </div>
  );
}

// === Indicateur de tendance ===
function TrendIndicator({ value }: { value: number }) {
  const positive = value >= 0;
  return (
    <div className={`flex items-center gap-1 ${positive ? 'text-green-600' : 'text-red-600'}`}>
      {positive ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
      <span>{Math.abs(value).toFixed(1)}%</span>
    </div>
  );
}
