import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronRight,
  KeyRound,
  LogOut,
  Pencil,
  User,
} from "lucide-react";
import api from "../../lib/api";
import { useAuth } from "../../lib/AuthContext";
import { useLanguage } from "../../context/LanguageContext";
import { displayMealPlanMr, displayStatusMr } from "../../lib/memberLabelsMr";
import { formatCurrencyINR } from "../../lib/dateUtils";
import Button from "../../components/ui/Button";
import LoadingOverlay from "../../components/ui/LoadingOverlay";
import Modal from "../../components/ui/Modal";

export default function ProfileTab({ onTabChange }) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { language } = useLanguage();
  const [member, setMember] = useState(null);
  const [loading, setLoading] = useState(true);
  const [logoutOpen, setLogoutOpen] = useState(false);

  const fetchProfile = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    try {
      const res = await api.get(`/api/members/${user.id}`);
      setMember(res?.data || null);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  if (loading) return <LoadingOverlay visible />;

  const memberName = member?.name || user?.name || "Member";
  const statusEn = member?.status || "N/A";
  const mealPlanEn = member?.mealPlan || "N/A";
  const status = displayStatusMr(language, statusEn, member?.statusMr);
  const mealPlan = displayMealPlanMr(language, mealPlanEn, member?.mealPlanMr);
  const dueAmount = Number(member?.dueAmount ?? 0);
  const totalFee =
    mealPlanEn === "Both" ? 3000 : mealPlanEn === "Lunch" || mealPlanEn === "Dinner" ? 1500 : member?.totalMessFee;

  const handleLogout = async () => {
    await logout();
    navigate("/", { replace: true });
  };

  return (
    <div className="min-h-dvh bg-white pb-16">
      <header className="safe-top relative overflow-hidden rounded-b-[28px] bg-gradient-to-br from-brand to-teal-700 px-5 pb-10 pt-4 text-white">
        <div className="flex items-center gap-4">
          <img
            src={`https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(memberName)}`}
            alt=""
            className="h-20 w-20 rounded-full border-2 border-white/80 bg-white"
          />
          <div>
            <h1 className="text-2xl font-extrabold">{memberName}</h1>
            <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-white/20 px-3 py-1 text-xs font-bold">
              <span className="h-2 w-2 rounded-full bg-green-300" />
              {status}
            </span>
            <p className="mt-2 text-sm text-white/85">Room owner: {member?.roomOwnerName || "N/A"}</p>
          </div>
        </div>
      </header>

      <div className="space-y-4 px-4 -mt-6">
        <div className="rounded-2xl border border-slate-100 bg-surface grid grid-cols-2 gap-3 p-4">
          <div>
            <p className="text-xs text-muted">Meal plan</p>
            <p className="font-extrabold text-ink">{mealPlan}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Mess fee</p>
            <p className="font-extrabold text-ink">
              {typeof totalFee === "number" ? formatCurrencyINR(totalFee) : "N/A"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted">Due amount</p>
            <p className={`font-extrabold ${dueAmount > 0 ? "text-red-600" : "text-green-700"}`}>
              {formatCurrencyINR(dueAmount)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted">Phone</p>
            <p className="font-extrabold text-ink">{member?.phone || "N/A"}</p>
          </div>
        </div>

        {[
          { icon: Pencil, label: "Edit profile", to: "/profile/edit" },
          { icon: KeyRound, label: "Change password", to: "/profile/change-password" },
          { icon: User, label: "Activity calendar", to: "/activity-calendar" },
        ].map(({ icon: Icon, label, to }) => (
          <button
            key={to}
            type="button"
            onClick={() => navigate(to)}
            className="flex w-full items-center gap-3 rounded-2xl bg-surface p-4 shadow-sm transition hover:bg-slate-100"
          >
            <Icon className="h-5 w-5 text-brand" />
            <span className="flex-1 text-left font-bold text-ink">{label}</span>
            <ChevronRight className="h-5 w-5 text-muted" />
          </button>
        ))}

        <Button variant="danger" className="w-full" onClick={() => setLogoutOpen(true)}>
          <LogOut className="h-5 w-5" />
          Log out
        </Button>
      </div>

      <Modal open={logoutOpen} title="Log out?" onClose={() => setLogoutOpen(false)}>
        <p className="mb-4">Are you sure you want to log out?</p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setLogoutOpen(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleLogout}>
            Log out
          </Button>
        </div>
      </Modal>
    </div>
  );
}
