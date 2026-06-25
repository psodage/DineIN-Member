import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mail, Phone, User } from "lucide-react";
import api from "../../lib/api";
import { useAuth } from "../../lib/AuthContext";
import PageHeader from "../../components/layout/PageHeader";
import Button from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import LoadingOverlay from "../../components/ui/LoadingOverlay";
import Modal from "../../components/ui/Modal";

export default function EditProfilePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [form, setForm] = useState({ name: "", roomOwnerName: "", phone: "", email: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState(null);

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    api
      .get(`/api/members/${user.id}`)
      .then((res) => {
        const m = res?.data || {};
        setForm({
          name: m.name || "",
          roomOwnerName: m.roomOwnerName || "",
          phone: m.phone || "",
          email: m.email || user.email || "",
        });
      })
      .finally(() => setLoading(false));
  }, [user?.id, user?.email]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!user?.id) return;
    try {
      setSaving(true);
      await api.put(`/api/members/${user.id}`, form);
      setModal({
        title: "Saved",
        body: "Profile updated successfully.",
        onClose: () => navigate(-1),
      });
    } catch (err) {
      setModal({ title: "Error", body: err?.response?.data?.message || "Update failed." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-dvh bg-surface">
      <PageHeader title="Edit profile" backTo="/dashboard?tab=profile" />
      {loading ? <LoadingOverlay visible /> : null}
      <form onSubmit={handleSave} className="space-y-3 px-5 py-6">
        <Input icon={User} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Name" />
        <Input icon={User} value={form.roomOwnerName} onChange={(e) => setForm((f) => ({ ...f, roomOwnerName: e.target.value }))} placeholder="Room owner" />
        <Input icon={Phone} value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="Phone" />
        <Input icon={Mail} type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="Email" />
        <Button type="submit" className="w-full" loading={saving}>
          Save changes
        </Button>
      </form>
      <Modal open={!!modal} title={modal?.title} onClose={() => { modal?.onClose?.(); setModal(null); }}>
        {modal?.body}
      </Modal>
    </div>
  );
}
