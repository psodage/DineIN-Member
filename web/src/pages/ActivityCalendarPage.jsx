import { useEffect, useState } from "react";
import api from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import PageHeader from "../components/layout/PageHeader";
import LoadingOverlay from "../components/ui/LoadingOverlay";

export default function ActivityCalendarPage() {
  const { user } = useAuth();
  const [member, setMember] = useState(null);
  const [leaveRows, setLeaveRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    Promise.all([
      api.get(`/api/members/${user.id}`),
      api.get(`/api/leave/student/${user.id}`),
    ])
      .then(([m, l]) => {
        setMember(m?.data);
        setLeaveRows(Array.isArray(l?.data?.requests) ? l.data.requests : []);
      })
      .finally(() => setLoading(false));
  }, [user?.id]);

  return (
    <div className="min-h-dvh bg-surface">
      <PageHeader title="Activity" backTo="/dashboard?tab=profile" />
      {loading ? <LoadingOverlay visible /> : null}
      <div className="space-y-4 px-4 py-4">
        <div className="glass-card p-4">
          <p className="text-sm text-muted">Member since</p>
          <p className="font-extrabold text-ink">
            {member?.joiningDate
              ? new Date(member.joiningDate).toLocaleDateString()
              : "N/A"}
          </p>
        </div>
        <div className="glass-card p-4">
          <h2 className="mb-3 font-extrabold">Recent leave activity</h2>
          {leaveRows.length === 0 ? (
            <p className="text-sm text-muted">No activity yet.</p>
          ) : (
            leaveRows.slice(0, 12).map((r) => (
              <div key={r._id} className="border-t border-slate-100 py-2 text-sm first:border-0">
                <span className="font-semibold capitalize">{r.status}</span>
                <span className="text-muted"> · {new Date(r.startDate || r.date).toLocaleDateString()}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
