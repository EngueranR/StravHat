import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../api/client";
import type { SubscriptionInfo } from "../api/types";
import { Card } from "../components/Card";
import { PageHeader } from "../components/PageHeader";
import { SectionHeader } from "../components/SectionHeader";
import {
  dangerButtonClass,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
  selectClass,
  subtlePanelClass,
} from "../components/ui";
import { useAuth } from "../contexts/AuthContext";

type UsageFeature = "STRAVA_IMPORT" | "AI_REQUEST" | "TRAINING_PLAN";
type UserStatusFilter = "all" | "pending" | "approved" | "banned";
type TierFilter = "all" | "FREE" | "SUPPORTER";

interface AdminOverviewResponse {
  generatedAt: string;
  users: {
    total: number;
    approved: number;
    pending: number;
    banned: number;
    admins: number;
    supporters: number;
    connectedToStrava: number;
    active24h: number;
    active7d: number;
  };
  data: {
    activities: number;
    trainingPlans: number;
    chartSnapshots: number;
    securityEvents: number;
  };
  usage: {
    today: Record<UsageFeature, number>;
    currentWeek: Record<UsageFeature, number>;
  };
  series: {
    signupsLast14Days: Array<{ day: string; count: number }>;
    loginsLast14Days: Array<{ day: string; count: number }>;
  };
  queues: {
    pendingUsers: Array<{
      id: string;
      email: string | null;
      createdAt: string;
      subscription: SubscriptionInfo;
    }>;
    recentBans: Array<{
      id: string;
      email: string | null;
      bannedAt: string;
      bannedReason: string | null;
    }>;
    recentSecurityEvents: Array<{
      id: string;
      userId: string | null;
      eventType: string;
      success: boolean;
      createdAt: string;
    }>;
  };
  plans: {
    configuredAdminEmails: string[];
    byTier: SubscriptionInfo[];
  };
}

interface AdminUserListResponse {
  total: number;
  limit: number;
  offset: number;
  items: AdminUserItem[];
}

interface AdminUserItem {
  id: string;
  email: string | null;
  isAdmin: boolean;
  isApproved: boolean;
  isBanned: boolean;
  bannedAt: string | null;
  bannedReason: string | null;
  stravaAthleteId: number | null;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
  activityCount: number;
  trainingPlanCount: number;
  securityEventCount: number;
  subscription: SubscriptionInfo;
}

interface SecurityEventsResponse {
  total: number;
  limit: number;
  offset: number;
  items: Array<{
    id: string;
    userId: string | null;
    eventType: string;
    success: boolean;
    ipHash: string | null;
    metadata: unknown;
    createdAt: string;
  }>;
}

interface AdminUserPatchPayload {
  isApproved?: boolean;
  isBanned?: boolean;
  bannedReason?: string | null;
  subscriptionTier?: "FREE" | "SUPPORTER";
  isAdmin?: boolean;
}

const USERS_PAGE_SIZE = 25;
const SECURITY_PAGE_SIZE = 25;

function formatDateTime(value: string | null) {
  if (!value) {
    return "N/A";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("fr-FR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusBadgeClass(item: AdminUserItem) {
  if (item.isBanned) {
    return "rounded-full border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-700";
  }

  if (!item.isApproved) {
    return "rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700";
  }

  return "rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700";
}

function statusLabel(item: AdminUserItem) {
  if (item.isBanned) {
    return "Banni";
  }
  if (!item.isApproved) {
    return "En attente";
  }
  return "Whitelist";
}

export function AdminPage() {
  const { token, user } = useAuth();
  const [overview, setOverview] = useState<AdminOverviewResponse | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [users, setUsers] = useState<AdminUserListResponse | null>(null);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [securityEvents, setSecurityEvents] = useState<SecurityEventsResponse | null>(null);
  const [securityLoading, setSecurityLoading] = useState(true);
  const [securityError, setSecurityError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [actionUserId, setActionUserId] = useState<string | null>(null);

  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<UserStatusFilter>("all");
  const [tierFilter, setTierFilter] = useState<TierFilter>("all");
  const [offset, setOffset] = useState(0);
  const [securityOffset, setSecurityOffset] = useState(0);

  const loadOverview = useCallback(async () => {
    if (!token) {
      return;
    }

    setOverviewLoading(true);
    setOverviewError(null);

    try {
      const response = await apiRequest<AdminOverviewResponse>("/admin/overview", { token });
      setOverview(response);
    } catch (error) {
      setOverviewError(error instanceof Error ? error.message : "Erreur chargement overview");
    } finally {
      setOverviewLoading(false);
    }
  }, [token]);

  const loadUsers = useCallback(async () => {
    if (!token) {
      return;
    }

    setUsersLoading(true);
    setUsersError(null);

    try {
      const params = new URLSearchParams({
        limit: String(USERS_PAGE_SIZE),
        offset: String(offset),
        status: statusFilter,
        tier: tierFilter,
      });

      if (search) {
        params.set("q", search);
      }

      const response = await apiRequest<AdminUserListResponse>(`/admin/users?${params.toString()}`, {
        token,
      });
      setUsers(response);
    } catch (error) {
      setUsersError(error instanceof Error ? error.message : "Erreur chargement utilisateurs");
    } finally {
      setUsersLoading(false);
    }
  }, [offset, search, statusFilter, tierFilter, token]);

  const loadSecurityEvents = useCallback(async () => {
    if (!token) {
      return;
    }

    setSecurityLoading(true);
    setSecurityError(null);

    try {
      const params = new URLSearchParams({
        limit: String(SECURITY_PAGE_SIZE),
        offset: String(securityOffset),
      });

      const response = await apiRequest<SecurityEventsResponse>(
        `/admin/security-events?${params.toString()}`,
        { token },
      );
      setSecurityEvents(response);
    } catch (error) {
      setSecurityError(error instanceof Error ? error.message : "Erreur chargement journal");
    } finally {
      setSecurityLoading(false);
    }
  }, [securityOffset, token]);

  useEffect(() => {
    loadOverview().catch(() => undefined);
  }, [loadOverview]);

  useEffect(() => {
    loadUsers().catch(() => undefined);
  }, [loadUsers]);

  useEffect(() => {
    loadSecurityEvents().catch(() => undefined);
  }, [loadSecurityEvents]);

  const usersHasNext = !!users && users.offset + users.limit < users.total;
  const securityHasNext =
    !!securityEvents && securityEvents.offset + securityEvents.limit < securityEvents.total;

  const signupsLast14Days = useMemo(
    () =>
      overview?.series.signupsLast14Days.reduce((total, item) => total + item.count, 0) ?? 0,
    [overview],
  );
  const loginsLast14Days = useMemo(
    () =>
      overview?.series.loginsLast14Days.reduce((total, item) => total + item.count, 0) ?? 0,
    [overview],
  );

  const patchUser = async (userId: string, payload: AdminUserPatchPayload, successMessage: string) => {
    if (!token) {
      return;
    }

    setActionUserId(userId);
    setStatusMessage(null);

    try {
      await apiRequest<{ item: AdminUserItem }>(`/admin/users/${userId}`, {
        method: "PATCH",
        token,
        body: payload,
      });
      setStatusMessage(successMessage);
      await Promise.all([loadOverview(), loadUsers(), loadSecurityEvents()]);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Action admin impossible");
    } finally {
      setActionUserId(null);
    }
  };

  if (!user?.isAdmin) {
    return (
      <div>
        <PageHeader
          title="Administration"
          description="Acces reserve aux administrateurs."
        />
        <Card>
          <p className="text-sm text-red-700">Tu n'as pas les droits administrateur.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Administration"
        description="Gestion whitelist, bannissement des comptes et supervision globale de la plateforme."
      />

      {statusMessage ? (
        <div className={`${subtlePanelClass} text-xs text-muted`}>{statusMessage}</div>
      ) : null}

      <Card>
        <SectionHeader
          title="Vue plateforme"
          subtitle="Comptes, activite, usage des quotas et etat des donnees."
          rightActions={
            <button
              className={secondaryButtonClass}
              onClick={() => {
                loadOverview().catch(() => undefined);
                loadUsers().catch(() => undefined);
                loadSecurityEvents().catch(() => undefined);
              }}
              type="button"
            >
              Rafraichir
            </button>
          }
        />

        {overviewLoading ? <p className="text-sm text-muted">Chargement des statistiques...</p> : null}
        {overviewError ? <p className="text-sm text-red-700">{overviewError}</p> : null}

        {overview ? (
          <div className="space-y-4">
            <p className="text-xs text-muted">Derniere mise a jour: {formatDateTime(overview.generatedAt)}</p>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className={subtlePanelClass}>
                <p className="text-xs text-muted">Utilisateurs total</p>
                <p className="mt-1 text-xl font-semibold">{overview.users.total}</p>
                <p className="text-xs text-muted">
                  Whitelist: {overview.users.approved} | En attente: {overview.users.pending}
                </p>
              </div>
              <div className={subtlePanelClass}>
                <p className="text-xs text-muted">Moderation</p>
                <p className="mt-1 text-xl font-semibold">{overview.users.banned}</p>
                <p className="text-xs text-muted">
                  Bannis | Admins: {overview.users.admins}
                </p>
              </div>
              <div className={subtlePanelClass}>
                <p className="text-xs text-muted">Connexion Strava</p>
                <p className="mt-1 text-xl font-semibold">{overview.users.connectedToStrava}</p>
                <p className="text-xs text-muted">
                  Actifs 24h: {overview.users.active24h} | 7j: {overview.users.active7d}
                </p>
              </div>
              <div className={subtlePanelClass}>
                <p className="text-xs text-muted">Plans Ravito</p>
                <p className="mt-1 text-xl font-semibold">{overview.users.supporters}</p>
                <p className="text-xs text-muted">Plan SUPPORTER actifs</p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className={subtlePanelClass}>
                <p className="text-xs text-muted">Activites</p>
                <p className="mt-1 text-lg font-semibold">{overview.data.activities}</p>
              </div>
              <div className={subtlePanelClass}>
                <p className="text-xs text-muted">Plans entrainement</p>
                <p className="mt-1 text-lg font-semibold">{overview.data.trainingPlans}</p>
              </div>
              <div className={subtlePanelClass}>
                <p className="text-xs text-muted">Snapshots analytics</p>
                <p className="mt-1 text-lg font-semibold">{overview.data.chartSnapshots}</p>
              </div>
              <div className={subtlePanelClass}>
                <p className="text-xs text-muted">Events securite</p>
                <p className="mt-1 text-lg font-semibold">{overview.data.securityEvents}</p>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <div className={subtlePanelClass}>
                <p className="text-xs font-semibold text-ink">Usage quotas</p>
                <p className="mt-2 text-xs text-muted">
                  Aujourd'hui: Import {overview.usage.today.STRAVA_IMPORT} | IA{" "}
                  {overview.usage.today.AI_REQUEST} | Plan {overview.usage.today.TRAINING_PLAN}
                </p>
                <p className="mt-1 text-xs text-muted">
                  Cette semaine: Import {overview.usage.currentWeek.STRAVA_IMPORT} | IA{" "}
                  {overview.usage.currentWeek.AI_REQUEST} | Plan{" "}
                  {overview.usage.currentWeek.TRAINING_PLAN}
                </p>
              </div>

              <div className={subtlePanelClass}>
                <p className="text-xs font-semibold text-ink">Dynamique 14 jours</p>
                <p className="mt-2 text-xs text-muted">
                  Inscriptions: {signupsLast14Days} | Logins: {loginsLast14Days}
                </p>
                <div className="mt-2 grid gap-1 text-[11px] text-muted">
                  {overview.series.signupsLast14Days.slice(-5).map((item) => (
                    <p key={`signup-${item.day}`}>
                      {item.day}: +{item.count} inscriptions
                    </p>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <div className={subtlePanelClass}>
                <p className="text-xs font-semibold text-ink">Admins configures</p>
                {overview.plans.configuredAdminEmails.length === 0 ? (
                  <p className="mt-2 text-xs text-muted">Aucun email admin configure.</p>
                ) : (
                  <div className="mt-2 space-y-1 text-xs text-muted">
                    {overview.plans.configuredAdminEmails.map((email) => (
                      <p className="break-all" key={email}>
                        {email}
                      </p>
                    ))}
                  </div>
                )}
              </div>

              <div className={subtlePanelClass}>
                <p className="text-xs font-semibold text-ink">Plans disponibles</p>
                <div className="mt-2 space-y-1 text-xs text-muted">
                  {overview.plans.byTier.map((plan) => (
                    <p key={plan.tier}>
                      {plan.name}: import {plan.limits.stravaImportsPerDay}/jour, IA{" "}
                      {plan.limits.aiRequestsPerDay}/jour, plan {plan.limits.trainingPlansPerWindow}/
                      {plan.limits.trainingPlanWindow === "day" ? "jour" : "semaine"}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </Card>

      <Card>
        <SectionHeader
          title="Whitelist et moderation rapide"
          subtitle="Validation des nouveaux comptes et vue des bannissements recents."
        />

        {!overview ? (
          <p className="text-sm text-muted">Aucune donnee de moderation disponible.</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className={subtlePanelClass}>
              <p className="text-xs font-semibold text-ink">Comptes en attente</p>
              {overview.queues.pendingUsers.length === 0 ? (
                <p className="mt-2 text-xs text-muted">Aucun compte en attente.</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {overview.queues.pendingUsers.map((pendingUser) => (
                    <div
                      className="rounded-xl border border-black/10 bg-white/70 p-3 text-xs"
                      key={pendingUser.id}
                    >
                      <p className="break-all font-semibold text-ink">
                        {pendingUser.email ?? pendingUser.id}
                      </p>
                      <p className="mt-1 text-muted">
                        Cree le {formatDateTime(pendingUser.createdAt)} | Plan {pendingUser.subscription.name}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          className={primaryButtonClass}
                          disabled={actionUserId === pendingUser.id}
                          onClick={() =>
                            patchUser(
                              pendingUser.id,
                              { isApproved: true, isBanned: false },
                              "Compte ajoute a la whitelist.",
                            )
                          }
                          type="button"
                        >
                          Whitelist
                        </button>
                        <button
                          className={dangerButtonClass}
                          disabled={actionUserId === pendingUser.id}
                          onClick={() => {
                            const reason = window.prompt("Motif du bannissement (optionnel):", "");
                            if (reason === null) {
                              return;
                            }
                            const payload: AdminUserPatchPayload = { isBanned: true };
                            if (reason.trim().length > 0) {
                              payload.bannedReason = reason.trim();
                            }
                            patchUser(
                              pendingUser.id,
                              payload,
                              "Compte banni.",
                            ).catch(() => undefined);
                          }}
                          type="button"
                        >
                          Bannir
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className={subtlePanelClass}>
              <p className="text-xs font-semibold text-ink">Bannissements recents</p>
              {overview.queues.recentBans.length === 0 ? (
                <p className="mt-2 text-xs text-muted">Aucun bannissement recent.</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {overview.queues.recentBans.map((ban) => (
                    <div className="rounded-xl border border-red-100 bg-red-50/40 p-3 text-xs" key={ban.id}>
                      <p className="break-all font-semibold text-ink">{ban.email ?? ban.id}</p>
                      <p className="mt-1 text-muted">Banni le {formatDateTime(ban.bannedAt)}</p>
                      <p className="mt-1 text-muted">
                        Motif: {ban.bannedReason && ban.bannedReason.trim() ? ban.bannedReason : "Non precise"}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Card>

      <Card>
        <SectionHeader
          title="Gestion des utilisateurs"
          subtitle="Recherche, whitelist, bannissement, plan et role admin."
        />

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr),180px,180px,auto]">
          <input
            className={inputClass}
            onChange={(event) => setSearchDraft(event.target.value)}
            placeholder="Recherche email ou userId"
            type="text"
            value={searchDraft}
          />
          <select
            className={selectClass}
            onChange={(event) => {
              setStatusFilter(event.target.value as UserStatusFilter);
              setOffset(0);
            }}
            value={statusFilter}
          >
            <option value="all">Tous statuts</option>
            <option value="pending">En attente</option>
            <option value="approved">Whitelist</option>
            <option value="banned">Bannis</option>
          </select>
          <select
            className={selectClass}
            onChange={(event) => {
              setTierFilter(event.target.value as TierFilter);
              setOffset(0);
            }}
            value={tierFilter}
          >
            <option value="all">Tous plans</option>
            <option value="FREE">Plan FREE</option>
            <option value="SUPPORTER">Plan SUPPORTER</option>
          </select>
          <button
            className={secondaryButtonClass}
            onClick={() => {
              setOffset(0);
              setSearch(searchDraft.trim());
            }}
            type="button"
          >
            Filtrer
          </button>
        </div>

        {usersLoading ? <p className="mt-4 text-sm text-muted">Chargement utilisateurs...</p> : null}
        {usersError ? <p className="mt-4 text-sm text-red-700">{usersError}</p> : null}

        {users ? (
          <div className="mt-4 space-y-3">
            <p className="text-xs text-muted">
              Total: {users.total} | Page: {Math.floor(users.offset / users.limit) + 1}
            </p>
            {users.items.length === 0 ? (
              <p className="text-sm text-muted">Aucun utilisateur pour ces filtres.</p>
            ) : (
              users.items.map((item) => (
                <div className="rounded-2xl border border-black/10 bg-black/[0.02] p-3 sm:p-4" key={item.id}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="break-all text-sm font-semibold">{item.email ?? item.id}</p>
                      <p className="mt-1 text-xs text-muted">ID: {item.id}</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <span className={statusBadgeClass(item)}>{statusLabel(item)}</span>
                      {item.isAdmin ? (
                        <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700">
                          Admin
                        </span>
                      ) : null}
                      <span className="rounded-full border border-black/15 bg-white px-2 py-1 text-[11px] font-semibold text-ink">
                        {item.subscription.name}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-2 text-xs text-muted sm:grid-cols-2 lg:grid-cols-4">
                    <p>Athlete: {item.stravaAthleteId ?? "N/A"}</p>
                    <p>Activites: {item.activityCount}</p>
                    <p>Plans: {item.trainingPlanCount}</p>
                    <p>Events secu: {item.securityEventCount}</p>
                    <p>Cree: {formatDateTime(item.createdAt)}</p>
                    <p>Maj: {formatDateTime(item.updatedAt)}</p>
                    <p>Dernier login: {formatDateTime(item.lastLoginAt)}</p>
                    <p>
                      Ban: {item.bannedAt ? formatDateTime(item.bannedAt) : "Non"}
                    </p>
                  </div>

                  {item.bannedReason ? (
                    <p className="mt-2 rounded-lg border border-red-100 bg-red-50/50 px-2 py-1 text-xs text-red-700">
                      Motif ban: {item.bannedReason}
                    </p>
                  ) : null}

                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.isApproved ? (
                      <button
                        className={secondaryButtonClass}
                        disabled={actionUserId === item.id || item.isBanned || item.id === user.id}
                        onClick={() =>
                          patchUser(
                            item.id,
                            { isApproved: false },
                            "Utilisateur retire de la whitelist.",
                          )
                        }
                        type="button"
                      >
                        Retirer whitelist
                      </button>
                    ) : (
                      <button
                        className={primaryButtonClass}
                        disabled={actionUserId === item.id}
                        onClick={() =>
                          patchUser(
                            item.id,
                            { isApproved: true, isBanned: false },
                            "Utilisateur ajoute a la whitelist.",
                          )
                        }
                        type="button"
                      >
                        Ajouter whitelist
                      </button>
                    )}

                    {item.isBanned ? (
                      <button
                        className={secondaryButtonClass}
                        disabled={actionUserId === item.id}
                        onClick={() =>
                          patchUser(
                            item.id,
                            { isBanned: false },
                            "Compte debanni.",
                          )
                        }
                        type="button"
                      >
                        Debannir
                      </button>
                    ) : (
                      <button
                        className={dangerButtonClass}
                        disabled={actionUserId === item.id || item.id === user.id}
                        onClick={() => {
                          const reason = window.prompt("Motif du bannissement (optionnel):", "");
                          if (reason === null) {
                            return;
                          }
                          const payload: AdminUserPatchPayload = { isBanned: true };
                          if (reason.trim().length > 0) {
                            payload.bannedReason = reason.trim();
                          }
                          patchUser(item.id, payload, "Compte banni.").catch(() => undefined);
                        }}
                        type="button"
                      >
                        Bannir
                      </button>
                    )}

                    <button
                      className={secondaryButtonClass}
                      disabled={actionUserId === item.id}
                      onClick={() =>
                        patchUser(
                          item.id,
                          {
                            subscriptionTier:
                              item.subscription.tier === "FREE" ? "SUPPORTER" : "FREE",
                          },
                          `Plan mis a jour: ${
                            item.subscription.tier === "FREE" ? "SUPPORTER" : "FREE"
                          }.`,
                        )
                      }
                      type="button"
                    >
                      {item.subscription.tier === "FREE" ?
                        "Passer SUPPORTER"
                      : "Passer FREE"}
                    </button>

                    <button
                      className={secondaryButtonClass}
                      disabled={actionUserId === item.id || item.id === user.id}
                      onClick={() =>
                        patchUser(
                          item.id,
                          { isAdmin: !item.isAdmin },
                          item.isAdmin ? "Role admin retire." : "Role admin ajoute.",
                        )
                      }
                      type="button"
                    >
                      {item.isAdmin ? "Retirer admin" : "Promouvoir admin"}
                    </button>
                  </div>
                </div>
              ))
            )}

            <div className="flex flex-wrap gap-2">
              <button
                className={secondaryButtonClass}
                disabled={users.offset === 0 || usersLoading}
                onClick={() => setOffset((current) => Math.max(current - USERS_PAGE_SIZE, 0))}
                type="button"
              >
                Page precedente
              </button>
              <button
                className={secondaryButtonClass}
                disabled={!usersHasNext || usersLoading}
                onClick={() => setOffset((current) => current + USERS_PAGE_SIZE)}
                type="button"
              >
                Page suivante
              </button>
            </div>
          </div>
        ) : null}
      </Card>

      <Card>
        <SectionHeader
          title="Journal securite"
          subtitle="Evenements de securite recents (auth, OAuth, actions admin)."
        />

        {securityLoading ? <p className="text-sm text-muted">Chargement du journal...</p> : null}
        {securityError ? <p className="text-sm text-red-700">{securityError}</p> : null}

        {securityEvents ? (
          <div className="space-y-2">
            {securityEvents.items.length === 0 ? (
              <p className="text-sm text-muted">Aucun evenement trouve.</p>
            ) : (
              securityEvents.items.map((event) => (
                <div className="rounded-xl border border-black/10 bg-black/[0.02] p-3 text-xs" key={event.id}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-ink">{event.eventType}</p>
                    <span
                      className={
                        event.success ?
                          "rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700"
                        : "rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700"
                      }
                    >
                      {event.success ? "SUCCESS" : "FAIL"}
                    </span>
                  </div>
                  <p className="mt-1 break-all text-muted">
                    User: {event.userId ?? "N/A"} | Date: {formatDateTime(event.createdAt)}
                  </p>
                </div>
              ))
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                className={secondaryButtonClass}
                disabled={securityEvents.offset === 0 || securityLoading}
                onClick={() =>
                  setSecurityOffset((current) => Math.max(current - SECURITY_PAGE_SIZE, 0))
                }
                type="button"
              >
                Page precedente
              </button>
              <button
                className={secondaryButtonClass}
                disabled={!securityHasNext || securityLoading}
                onClick={() => setSecurityOffset((current) => current + SECURITY_PAGE_SIZE)}
                type="button"
              >
                Page suivante
              </button>
            </div>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
