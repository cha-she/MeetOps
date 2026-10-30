import { useState, type FormEvent } from "react";
import { Building2, KeyRound, Pencil, Plus, ShieldCheck, Trash2, UserPlus, Users } from "lucide-react";
import { api } from "../api/endpoints";
import { useQuery } from "../api/hooks";
import { isAdmin, roleLabel, useMe } from "../auth/AuthContext";
import { Avatar, Badge, ConfirmDialog, Dialog, EmptyState, Field, FilterSelect, PageHeader, Panel, QueryView, RowsSkeleton, SearchInput, cn } from "../components/ui";
import { useMutation } from "../hooks/useMutation";
import type { Department, Role, User } from "../types";

const REFRESH = ["users", "departments", "insights", "activity"];
const roleTone = { admin: "violet", manager: "blue", member: "neutral" } as const;

function UserDialog({ user, departments, onClose }: { user: User | null; departments: Department[]; onClose: () => void }) {
  const editing = !!user;
  const [form, setForm] = useState({
    name: user?.name ?? "",
    email: user?.email ?? "",
    password: "",
    role: (user?.role ?? "member") as Role,
    title: user?.title ?? "",
    departmentId: user?.department?.id ?? departments[0]?.id ?? 0,
  });
  const { run, busy } = useMutation();

  async function submit(e: FormEvent) {
    e.preventDefault();
    const ok = editing
      ? await run(
          () =>
            api.updateUser(user!.id, {
              name: form.name.trim(),
              role: form.role,
              title: form.title.trim() || null,
              departmentId: form.departmentId || null,
              ...(form.password ? { password: form.password } : {}),
            }),
          { success: "Account updated", refresh: REFRESH }
        )
      : await run(
          () => api.createUser({ name: form.name.trim(), email: form.email.trim(), password: form.password, role: form.role, title: form.title.trim() || undefined, departmentId: form.departmentId || null }),
          { success: `Account created for ${form.name.trim()}`, refresh: REFRESH }
        );
    if (ok) onClose();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={editing ? `Edit ${user!.name}` : "Add a person"}
      description={editing ? user!.email : "They sign in with this email and the temporary password you set."}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" form="user-form" disabled={busy}>{editing ? "Save" : "Create account"}</button>
        </>
      }
    >
      <form id="user-form" onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Full name" hint="First name should match the speaker name in transcripts.">
            <input className="field" required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
          </Field>
          <Field label="Job title">
            <input className="field" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. QA Engineer" />
          </Field>
        </div>
        {!editing && (
          <Field label="Email">
            <input className="field" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Department">
            <select className="field" value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: Number(e.target.value) })}>
              <option value={0}>None</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </Field>
          <Field label="Role">
            <select className="field" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              <option value="member">Member: own tasks</option>
              <option value="manager">Manager: department</option>
              <option value="admin">Admin: everything</option>
            </select>
          </Field>
        </div>
        <Field label={editing ? "New password (leave empty to keep)" : "Temporary password"} hint="At least 8 characters.">
          <input className="field" type="password" autoComplete="new-password" minLength={8} required={!editing} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </Field>
      </form>
    </Dialog>
  );
}

function DepartmentDialog({ dept, onClose }: { dept: Department | null; onClose: () => void }) {
  const [name, setName] = useState(dept?.name ?? "");
  const { run, busy } = useMutation();
  async function submit(e: FormEvent) {
    e.preventDefault();
    const ok = dept
      ? await run(() => api.renameDepartment(dept.id, name.trim()), { success: "Department renamed", refresh: REFRESH })
      : await run(() => api.createDepartment(name.trim()), { success: "Department created", refresh: REFRESH });
    if (ok) onClose();
  }
  return (
    <Dialog open onClose={onClose} title={dept ? "Rename department" : "New department"} width={400} footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" form="dept-form" disabled={busy || name.trim().length < 2}>Save</button></>}>
      <form id="dept-form" onSubmit={submit}>
        <Field label="Name">
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
      </form>
    </Dialog>
  );
}

export default function Team() {
  const me = useMe();
  const admin = isAdmin(me);
  const users = useQuery(`users:all:${admin}`, () => api.listUsers(admin));
  const depts = useQuery("departments", () => api.listDepartments());
  const [q, setQ] = useState("");
  const [deptFilter, setDeptFilter] = useState<number | "">("");
  const [editUser, setEditUser] = useState<User | null | "new">(null);
  const [editDept, setEditDept] = useState<Department | null | "new">(null);
  const [deleteDept, setDeleteDept] = useState<Department | null>(null);
  const { run, busy } = useMutation();

  const list = (users.data ?? []).filter((u) => (!q || `${u.name} ${u.email} ${u.title ?? ""}`.toLowerCase().includes(q.toLowerCase())) && (!deptFilter || u.department?.id === deptFilter));

  return (
    <div>
      <PageHeader
        icon={<Users className="h-5 w-5 text-faint" />}
        title="Team"
        description={admin ? "Departments and accounts. Each person signs in with their own account and sees their own tasks." : "People and departments in your organisation."}
        actions={admin && (
          <>
            <button className="btn-secondary" onClick={() => setEditDept("new")}><Building2 className="h-4 w-4" /> New department</button>
            <button className="btn-primary" onClick={() => setEditUser("new")} disabled={!depts.data}><UserPlus className="h-4 w-4" /> Add person</button>
          </>
        )}
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <Panel
          title={`People · ${list.length}`}
          actions={
            <div className="flex gap-2">
              <SearchInput value={q} onChange={setQ} placeholder="Search people…" className="w-44" />
              <FilterSelect label="Dept" value={deptFilter} onChange={(v) => setDeptFilter(v === "" ? "" : Number(v))} options={(depts.data ?? []).map((d) => ({ value: d.id, label: d.name }))} />
            </div>
          }
        >
          <QueryView {...users} onRetry={users.reload} skeleton={<RowsSkeleton rows={5} />} isEmpty={() => list.length === 0} empty={<EmptyState compact title="Nobody matches" />}>
            {() => (
              <div className="overflow-x-auto">
                <table className="table min-w-[640px]">
                  <thead>
                    <tr>
                      <th>Person</th>
                      <th>Department</th>
                      <th>Role</th>
                      {admin && <th className="w-24" />}
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((u) => (
                      <tr key={u.id} className={cn(!u.isActive && "opacity-50")}>
                        <td>
                          <div className="flex items-center gap-2.5">
                            <Avatar name={u.name} initials={u.initials} size={28} />
                            <div className="min-w-0">
                              <div className="font-medium">{u.name} {u.id === me.id && <span className="text-2xs font-normal text-faint">(you)</span>}</div>
                              <div className="truncate text-2xs text-faint">{u.title ? `${u.title} · ` : ""}{u.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="text-muted">{u.department?.name ?? "—"}</td>
                        <td>
                          <Badge tone={roleTone[u.role]}>{u.role === "admin" && <ShieldCheck className="h-3 w-3" />}{roleLabel[u.role]}</Badge>
                          {!u.isActive && <Badge className="ml-1">Deactivated</Badge>}
                        </td>
                        {admin && (
                          <td>
                            <div className="flex justify-end gap-1">
                              <button className="icon-btn h-7 w-7" title="Edit / reset password" onClick={() => setEditUser(u)}><KeyRound className="h-3.5 w-3.5" /></button>
                              {u.id !== me.id && (
                                <button className="btn-ghost btn-sm" disabled={busy} onClick={() => run(() => api.updateUser(u.id, { isActive: !u.isActive }), { success: u.isActive ? `${u.name} deactivated` : `${u.name} reactivated`, refresh: REFRESH })}>
                                  {u.isActive ? "Deactivate" : "Reactivate"}
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </QueryView>
        </Panel>

        <div className="space-y-5">
          <Panel title="Departments">
            <QueryView {...depts} onRetry={depts.reload} skeleton={<RowsSkeleton rows={3} />} isEmpty={(d) => d.length === 0} empty={<EmptyState compact title="No departments" />}>
              {(list) => (
                <div className="divide-y divide-line">
                  {list.map((d) => (
                    <div key={d.id} className="group flex items-center gap-2 px-4 py-2.5">
                      <Building2 className="h-4 w-4 text-faint" />
                      <button className="flex-1 text-left text-[13px] font-medium hover:text-accent-text" onClick={() => setDeptFilter(d.id)}>{d.name}</button>
                      <span className="text-2xs tabular-nums text-faint">{d.memberCount}</span>
                      {admin && (
                        <span className="flex opacity-0 transition group-hover:opacity-100">
                          <button className="icon-btn h-6 w-6" title="Rename" onClick={() => setEditDept(d)}><Pencil className="h-3 w-3" /></button>
                          <button className="icon-btn h-6 w-6" title="Delete" onClick={() => setDeleteDept(d)}><Trash2 className="h-3 w-3" /></button>
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </QueryView>
            {admin && (
              <div className="border-t border-line p-2">
                <button className="btn-ghost btn-sm w-full justify-start" onClick={() => setEditDept("new")}><Plus className="h-3.5 w-3.5" /> Add department</button>
              </div>
            )}
          </Panel>
          <Panel title="Roles">
            <ul className="space-y-2.5 p-4 text-[12px] text-muted">
              <li><Badge tone="violet">Admin</Badge> manages people and departments, and can change everything.</li>
              <li><Badge tone="blue">Manager</Badge> reviews and edits items from their department's meetings.</li>
              <li><Badge>Member</Badge> updates their own tasks and reviews items from meetings they attended.</li>
            </ul>
          </Panel>
        </div>
      </div>

      {editUser && depts.data && <UserDialog user={editUser === "new" ? null : editUser} departments={depts.data} onClose={() => setEditUser(null)} />}
      {editDept && <DepartmentDialog dept={editDept === "new" ? null : editDept} onClose={() => setEditDept(null)} />}
      <ConfirmDialog
        open={!!deleteDept}
        danger
        busy={busy}
        title={`Delete ${deleteDept?.name}?`}
        message="Departments can only be deleted when nobody belongs to them. Meetings keep their history."
        confirmLabel="Delete"
        onClose={() => setDeleteDept(null)}
        onConfirm={async () => {
          await run(() => api.deleteDepartment(deleteDept!.id), { success: "Department deleted", refresh: REFRESH });
          setDeleteDept(null);
        }}
      />
    </div>
  );
}
