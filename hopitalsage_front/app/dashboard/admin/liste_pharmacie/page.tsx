'use client';

import React, { useEffect, useState } from 'react';
import HeaderAdmin from '../HeaderAdmin';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { motion } from 'framer-motion';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

/* ===================== INTERFACES ===================== */

interface PharmacieData {
  id: string;
  nom_pharm: string;
  ville_pharm: string;
  commune_pharm: string;
  adresse_pharm: string;
  telephone: string;
  montant_mensuel: number;
  date_expiration: string | null;
  jours_restants: number;
  est_expiree: boolean;
}

interface User {
  id: string;
  username: string;
  role: string;
  is_active: boolean;
  is_online: boolean;
  total_connections: number;
  total_time_seconds: number;
}

/* ===================== CONSTANTES ===================== */

const ITEMS_PER_PAGE = 5;

/* ===================== COMPONENT ===================== */

export default function PharmaciesPage() {
  const [userData, setUserData] = useState<any>(null);
  const [pharmacies, setPharmacies] = useState<PharmacieData[]>([]);
  const [usersByPharmacie, setUsersByPharmacie] = useState<Record<string, User[]>>({});
  const [openedPharmacie, setOpenedPharmacie] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  /* ===================== LOAD USER ===================== */

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) setUserData(JSON.parse(storedUser));
  }, []);

  /* ===================== LOAD PHARMACIES ===================== */

  useEffect(() => {
    const fetchPharmacies = async () => {
      const token = localStorage.getItem('accessToken');
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/pharmacies/`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!res.ok) throw new Error();
        setPharmacies(await res.json());
      } catch {
        toast.error("Erreur de chargement des pharmacies");
      } finally {
        setLoading(false);
      }
    };
    fetchPharmacies();
  }, []);

  /* ===================== LOAD USERS ===================== */

  const fetchUsers = async (pharmacieId: string) => {
    if (usersByPharmacie[pharmacieId]) {
      setOpenedPharmacie(pharmacieId);
      return;
    }

    setLoadingUsers(true);
    const token = localStorage.getItem('accessToken');

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/admin/pharmacies/${pharmacieId}/users/`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error();
      const data = await res.json();
      setUsersByPharmacie((prev) => ({ ...prev, [pharmacieId]: data }));
      setOpenedPharmacie(pharmacieId);
    } catch {
      toast.error("Impossible de charger les utilisateurs");
    } finally {
      setLoadingUsers(false);
    }
  };

  /* ===================== ACTIONS ===================== */

  const toggleUserStatus = async (userId: string) => {
    const token = localStorage.getItem('accessToken');
    await fetch(
      `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/admin/users/${userId}/toggle-active/`,
      { method: 'POST', headers: { Authorization: `Bearer ${token}` } }
    );
    toast.success("Statut utilisateur modifié");
  };

  const deleteUser = async (userId: string) => {
    const token = localStorage.getItem('accessToken');
    await fetch(
      `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/admin/users/${userId}/`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
    );
    toast.success("Utilisateur supprimé");
  };

  /* ===================== HELPERS ===================== */

  const formatDuration = (seconds: number) => {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${d}j ${h}h ${m}m`;
  };

  /* ===================== PAGINATION ===================== */

  const totalPages = Math.ceil(pharmacies.length / ITEMS_PER_PAGE);
  const currentPharmacies = pharmacies.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  /* ===================== LOADING ===================== */

  if (loading || !userData) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin h-14 w-14 border-4 border-blue-500 rounded-full border-t-transparent" />
      </div>
    );
  }

  /* ===================== RENDER ===================== */

  return (
    <>
      <HeaderAdmin user={userData} />

      <main className="p-6">
        <h1 className="text-3xl font-bold text-center text-blue-600 mb-6">
          Gestion des Pharmacies
        </h1>

        <div className="bg-white dark:bg-zinc-900 rounded shadow p-4 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>Ville</TableHead>
                <TableHead>Commune</TableHead>
                <TableHead>Téléphone</TableHead>
                <TableHead>Montant</TableHead>
                <TableHead>Expiration</TableHead>
                <TableHead>Jours</TableHead>
                <TableHead>Utilisateurs</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {currentPharmacies.map((pharm) => (
                <React.Fragment key={pharm.id}>
                  <TableRow>
                    <TableCell>{pharm.nom_pharm}</TableCell>
                    <TableCell>{pharm.ville_pharm}</TableCell>
                    <TableCell>{pharm.commune_pharm}</TableCell>
                    <TableCell>{pharm.telephone}</TableCell>
                    <TableCell>${pharm.montant_mensuel}</TableCell>
                    <TableCell>
                      {pharm.date_expiration
                        ? new Date(pharm.date_expiration).toLocaleDateString()
                        : '—'}
                    </TableCell>
                    <TableCell>{pharm.jours_restants}</TableCell>
                    <TableCell>
                      <button
                        onClick={() => fetchUsers(pharm.id)}
                        className="text-blue-600 underline"
                      >
                        {openedPharmacie === pharm.id
                          ? 'Masquer'
                          : 'Voir utilisateurs'}
                      </button>
                    </TableCell>
                  </TableRow>

                  {openedPharmacie === pharm.id && (
                    <TableRow>
                      <TableCell colSpan={8}>
                        <div className="space-y-2 p-3 bg-gray-50 dark:bg-zinc-800 rounded">
                          {loadingUsers ? (
                            <p>Chargement...</p>
                          ) : usersByPharmacie[pharm.id]?.length ? (
                            usersByPharmacie[pharm.id].map((u) => (
                              <div
                                key={u.id}
                                className="flex justify-between items-center border p-2 rounded"
                              >
                                <div>
                                  <p className="font-semibold">{u.username}</p>
                                  <p className="text-sm text-gray-500">{u.role}</p>
                                  <p className="text-xs">
                                    Connexions : {u.total_connections} | Temps :
                                    {formatDuration(u.total_time_seconds)}
                                  </p>
                                </div>

                                <div className="flex gap-2">
                                  <span
                                    className={`px-2 py-1 text-xs rounded ${
                                      u.is_online
                                        ? 'bg-green-500 text-white'
                                        : 'bg-gray-400 text-white'
                                    }`}
                                  >
                                    {u.is_online ? 'En ligne' : 'Hors ligne'}
                                  </span>

                                  <button
                                    onClick={() => toggleUserStatus(u.id)}
                                    className={`px-3 py-1 text-white rounded ${
                                      u.is_active
                                        ? 'bg-red-500'
                                        : 'bg-green-500'
                                    }`}
                                  >
                                    {u.is_active ? 'Bloquer' : 'Débloquer'}
                                  </button>

                                  <button
                                    onClick={() => deleteUser(u.id)}
                                    className="bg-black text-white px-3 py-1 rounded"
                                  >
                                    Supprimer
                                  </button>
                                </div>
                              </div>
                            ))
                          ) : (
                            <p>Aucun utilisateur</p>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              ))}
            </TableBody>
          </Table>

          {/* Pagination */}
          <div className="flex justify-center mt-4 gap-2">
            {Array.from({ length: totalPages }, (_, i) => (
              <button
                key={i}
                onClick={() => setCurrentPage(i + 1)}
                className={`px-3 py-1 rounded ${
                  currentPage === i + 1
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200'
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>
        </div>
      </main>

      <ToastContainer position="top-right" autoClose={3000} />
    </>
  );
}
