import React, { useEffect, useMemo, useState } from 'react';
import {
  createAdminCompany,
  createAdminStore,
  createAdminUser,
  getAdminCompanies,
  getAdminStores,
  getAdminUsers,
  updateAdminUser,
} from '../api/adminApi';
import { getWhatsAppStatus } from '../api/whatsappApi';

const roleOptions = [
  { value: 'master', label: 'Master' },
  { value: 'admin', label: 'Admin' },
  { value: 'user', label: 'Operador' },
];

function normalizeUiRole(role) {
  return role === 'user' ? 'user' : role || 'user';
}

function formatUiRole(role) {
  if (role === 'master') return 'Master';
  if (role === 'admin') return 'Admin';
  return 'Operador';
}

function getStatusLabel(status) {
  if (status === 'connected') return 'Conectado';
  if (status === 'qr_ready') return 'QR pronto';
  if (status === 'reconnecting') return 'Reconectando';
  if (status === 'connecting') return 'Conectando';
  if (status === 'disconnected') return 'Desconectado';
  return status || 'Desconhecido';
}

const emptyUserForm = {
  email: '',
  password: '',
  role: 'user',
  companyId: '',
  storeId: '',
  isActive: true,
};

const emptyCompanyForm = {
  name: '',
  slug: '',
  isActive: true,
};

const emptyStoreForm = {
  companyId: '',
  name: '',
  slug: '',
  isActive: true,
};

function AdminPanel() {
  const [users, setUsers] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [stores, setStores] = useState([]);
  const [statusesByStoreId, setStatusesByStoreId] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [userForm, setUserForm] = useState(emptyUserForm);
  const [companyForm, setCompanyForm] = useState(emptyCompanyForm);
  const [storeForm, setStoreForm] = useState(emptyStoreForm);
  const [editingUsers, setEditingUsers] = useState({});
  const [savingUserId, setSavingUserId] = useState(null);
  const [creatingUser, setCreatingUser] = useState(false);
  const [creatingCompany, setCreatingCompany] = useState(false);
  const [creatingStore, setCreatingStore] = useState(false);

  const storesByCompanyId = useMemo(() => {
    const grouped = {};

    for (const store of stores) {
      const key = store.companyId || 'unassigned';
      if (!grouped[key]) {
        grouped[key] = [];
      }

      grouped[key].push(store);
    }

    return grouped;
  }, [stores]);

  const overview = useMemo(() => {
    const activeUsers = users.filter((user) => user.isActive).length;
    const activeCompanies = companies.filter((company) => company.isActive).length;
    const activeStores = stores.filter((store) => store.isActive).length;

    return {
      users: users.length,
      activeUsers,
      companies: companies.length,
      activeCompanies,
      stores: stores.length,
      activeStores,
    };
  }, [users, companies, stores]);

  useEffect(() => {
    loadAdminData();
  }, []);

  const loadAdminData = async () => {
    try {
      setLoading(true);
      setError('');

      const [loadedUsers, loadedCompanies, loadedStores] = await Promise.all([
        getAdminUsers(),
        getAdminCompanies(),
        getAdminStores(),
      ]);

      setUsers(loadedUsers);
      setCompanies(loadedCompanies);
      setStores(loadedStores);
      setEditingUsers(buildEditingState(loadedUsers));

      const statusEntries = await Promise.all(
        loadedStores.map(async (store) => {
          try {
            const status = await getWhatsAppStatus(store.id);
            return [String(store.id), status];
          } catch (requestError) {
            return [String(store.id), { status: 'indisponivel' }];
          }
        })
      );

      setStatusesByStoreId(Object.fromEntries(statusEntries));
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível carregar a área administrativa.');
    } finally {
      setLoading(false);
    }
  };

  const buildEditingState = (loadedUsers) => {
    return Object.fromEntries(
      loadedUsers.map((user) => [
        String(user.id),
        {
          email: user.email,
          role: normalizeUiRole(user.role),
          companyId: user.companyId || '',
          storeId: user.storeId || '',
          isActive: Boolean(user.isActive),
          password: '',
        },
      ])
    );
  };

  const setFlashMessage = (message) => {
    setSuccessMessage(message);
    setTimeout(() => {
      setSuccessMessage('');
    }, 2500);
  };

  const handleCreateCompany = async (event) => {
    event.preventDefault();
    setCreatingCompany(true);
    setError('');

    try {
      await createAdminCompany({
        name: companyForm.name,
        slug: companyForm.slug || null,
        isActive: companyForm.isActive,
      });

      setCompanyForm(emptyCompanyForm);
      setFlashMessage('Empresa criada com sucesso.');
      await loadAdminData();
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível criar a empresa.');
    } finally {
      setCreatingCompany(false);
    }
  };

  const handleCreateStore = async (event) => {
    event.preventDefault();
    setCreatingStore(true);
    setError('');

    try {
      await createAdminStore({
        companyId: storeForm.companyId,
        name: storeForm.name,
        slug: storeForm.slug || null,
        isActive: storeForm.isActive,
      });

      setStoreForm(emptyStoreForm);
      setFlashMessage('Loja criada com sucesso.');
      await loadAdminData();
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível criar a loja.');
    } finally {
      setCreatingStore(false);
    }
  };

  const handleCreateUser = async (event) => {
    event.preventDefault();
    setCreatingUser(true);
    setError('');

    try {
      await createAdminUser({
        email: userForm.email,
        password: userForm.password,
        role: userForm.role,
        companyId: userForm.companyId || null,
        storeId: userForm.storeId || null,
        isActive: userForm.isActive,
      });

      setUserForm(emptyUserForm);
      setFlashMessage('Usuário criado com sucesso.');
      await loadAdminData();
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível criar o usuário.');
    } finally {
      setCreatingUser(false);
    }
  };

  const handleEditingChange = (userId, field, value) => {
    setEditingUsers((current) => ({
      ...current,
      [userId]: {
        ...current[userId],
        [field]: value,
      },
    }));
  };

  const handleUpdateUser = async (userId) => {
    const currentEdit = editingUsers[String(userId)];
    if (!currentEdit) {
      return;
    }

    setSavingUserId(userId);
    setError('');

    try {
      const payload = {
        email: currentEdit.email,
        role: currentEdit.role,
        companyId: currentEdit.companyId || null,
        storeId: currentEdit.storeId || null,
        isActive: currentEdit.isActive,
      };

      if (currentEdit.password) {
        payload.password = currentEdit.password;
      }

      await updateAdminUser(userId, payload);
      setFlashMessage('Usuário atualizado com sucesso.');
      await loadAdminData();
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível atualizar o usuário.');
    } finally {
      setSavingUserId(null);
    }
  };

  const getAvailableStoresForCompany = (companyId) => {
    if (!companyId) {
      return stores;
    }

    return stores.filter((store) => String(store.companyId || '') === String(companyId));
  };

  if (loading) {
    return <div className="page-content">Carregando área administrativa...</div>;
  }

  return (
    <section className="page-content">
      <div className="admin-header">
        <div>
          <h1>Área Administrativa</h1>
          <p className="admin-subtitle">Gerencie usuários, empresas, lojas e conexão do WhatsApp por operação.</p>
        </div>
      </div>

      {error && <p className="error-message">{error}</p>}
      {successMessage && <p className="admin-success-message">{successMessage}</p>}

      <div className="admin-overview-grid">
        <article className="admin-overview-card">
          <strong>{overview.users}</strong>
          <span>Usuários</span>
          <small>{overview.activeUsers} ativos</small>
        </article>
        <article className="admin-overview-card">
          <strong>{overview.companies}</strong>
          <span>Empresas</span>
          <small>{overview.activeCompanies} ativas</small>
        </article>
        <article className="admin-overview-card">
          <strong>{overview.stores}</strong>
          <span>Lojas</span>
          <small>{overview.activeStores} ativas</small>
        </article>
      </div>

      <div className="admin-section-grid">
        <div className="admin-panel-card">
          <h2>Criar Empresa</h2>
          <form className="admin-form" onSubmit={handleCreateCompany}>
            <input
              type="text"
              placeholder="Nome da empresa"
              value={companyForm.name}
              onChange={(event) => setCompanyForm((current) => ({ ...current, name: event.target.value }))}
            />
            <input
              type="text"
              placeholder="Slug opcional"
              value={companyForm.slug}
              onChange={(event) => setCompanyForm((current) => ({ ...current, slug: event.target.value }))}
            />
            <label className="admin-checkbox">
              <input
                type="checkbox"
                checked={companyForm.isActive}
                onChange={(event) => setCompanyForm((current) => ({ ...current, isActive: event.target.checked }))}
              />
              Empresa ativa
            </label>
            <button className="button button-primary" type="submit" disabled={creatingCompany}>
              {creatingCompany ? 'Salvando...' : 'Criar empresa'}
            </button>
          </form>
        </div>

        <div className="admin-panel-card">
          <h2>Criar Loja</h2>
          <form className="admin-form" onSubmit={handleCreateStore}>
            <select
              value={storeForm.companyId}
              onChange={(event) => setStoreForm((current) => ({ ...current, companyId: event.target.value }))}
            >
              <option value="">Selecione a empresa</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Nome da loja"
              value={storeForm.name}
              onChange={(event) => setStoreForm((current) => ({ ...current, name: event.target.value }))}
            />
            <input
              type="text"
              placeholder="Slug opcional"
              value={storeForm.slug}
              onChange={(event) => setStoreForm((current) => ({ ...current, slug: event.target.value }))}
            />
            <label className="admin-checkbox">
              <input
                type="checkbox"
                checked={storeForm.isActive}
                onChange={(event) => setStoreForm((current) => ({ ...current, isActive: event.target.checked }))}
              />
              Loja ativa
            </label>
            <button className="button button-primary" type="submit" disabled={creatingStore}>
              {creatingStore ? 'Salvando...' : 'Criar loja'}
            </button>
          </form>
        </div>

        <div className="admin-panel-card">
          <h2>Criar Usuário</h2>
          <form className="admin-form" onSubmit={handleCreateUser}>
            <input
              type="email"
              placeholder="Email"
              value={userForm.email}
              onChange={(event) => setUserForm((current) => ({ ...current, email: event.target.value }))}
            />
            <input
              type="password"
              placeholder="Senha"
              value={userForm.password}
              onChange={(event) => setUserForm((current) => ({ ...current, password: event.target.value }))}
            />
            <select
              value={userForm.role}
              onChange={(event) => setUserForm((current) => ({ ...current, role: event.target.value }))}
            >
              {roleOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              value={userForm.companyId}
              onChange={(event) => {
                const companyId = event.target.value;
                const availableStores = getAvailableStoresForCompany(companyId);
                const firstStoreId = companyId && userForm.role === 'user' ? (availableStores[0]?.id || '') : userForm.storeId;

                setUserForm((current) => ({
                  ...current,
                  companyId,
                  storeId: companyId ? firstStoreId : '',
                }));
              }}
            >
              <option value="">Empresa opcional</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
            <select
              value={userForm.storeId}
              onChange={(event) => setUserForm((current) => ({ ...current, storeId: event.target.value }))}
            >
              <option value="">Loja opcional</option>
              {getAvailableStoresForCompany(userForm.companyId).map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
            <label className="admin-checkbox">
              <input
                type="checkbox"
                checked={userForm.isActive}
                onChange={(event) => setUserForm((current) => ({ ...current, isActive: event.target.checked }))}
              />
              Usuário ativo
            </label>
            <button className="button button-primary" type="submit" disabled={creatingUser}>
              {creatingUser ? 'Salvando...' : 'Criar usuário'}
            </button>
          </form>
        </div>
      </div>

      <div className="admin-panel-card admin-panel-spaced">
        <h2>Visão Geral de Empresas e Lojas</h2>
        <div className="admin-company-list">
          {companies.map((company) => (
            <article key={company.id} className="admin-company-card">
              <div className="admin-company-header">
                <div>
                  <h3>{company.name}</h3>
                  <p>Slug: {company.slug || 'não definido'}</p>
                </div>
                <span className={company.isActive ? 'admin-badge success' : 'admin-badge muted'}>
                  {company.isActive ? 'Ativa' : 'Inativa'}
                </span>
              </div>
              <p>{company.storesCount || 0} lojas · {company.usersCount || 0} usuários</p>

              <div className="admin-store-list">
                {(storesByCompanyId[String(company.id)] || []).map((store) => {
                  const status = statusesByStoreId[String(store.id)];

                  return (
                    <div key={store.id} className="admin-store-card">
                      <div>
                        <strong>{store.name}</strong>
                        <p>Slug: {store.slug || 'não definido'}</p>
                      </div>
                      <div className="admin-store-meta">
                        <span className={store.isActive ? 'admin-badge success' : 'admin-badge muted'}>
                          {store.isActive ? 'Ativa' : 'Inativa'}
                        </span>
                        <span className="admin-badge info">
                          WhatsApp: {getStatusLabel(status?.status)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="admin-panel-card admin-panel-spaced">
        <h2>Usuários</h2>
        <div className="admin-users-table">
          <div className="admin-users-head">
            <span>Email</span>
            <span>Papel</span>
            <span>Empresa</span>
            <span>Loja</span>
            <span>Status</span>
            <span>Ações</span>
          </div>

          {users.map((user) => {
            const edit = editingUsers[String(user.id)] || {};
            const availableStores = getAvailableStoresForCompany(edit.companyId);

            return (
              <div key={user.id} className="admin-users-row">
                <input
                  type="email"
                  value={edit.email || ''}
                  onChange={(event) => handleEditingChange(String(user.id), 'email', event.target.value)}
                />
                <select
                  value={edit.role || 'user'}
                  onChange={(event) => handleEditingChange(String(user.id), 'role', event.target.value)}
                >
                  {roleOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <select
                  value={edit.companyId || ''}
                  onChange={(event) => {
                    const companyId = event.target.value;
                    const companyStores = getAvailableStoresForCompany(companyId);
                    const nextStoreId = edit.role === 'user' ? (companyStores[0]?.id || '') : edit.storeId;

                    setEditingUsers((current) => ({
                      ...current,
                      [String(user.id)]: {
                        ...current[String(user.id)],
                        companyId,
                        storeId: companyId ? nextStoreId : '',
                      },
                    }));
                  }}
                >
                  <option value="">Sem empresa</option>
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.name}
                    </option>
                  ))}
                </select>
                <select
                  value={edit.storeId || ''}
                  onChange={(event) => handleEditingChange(String(user.id), 'storeId', event.target.value)}
                >
                  <option value="">Sem loja</option>
                  {availableStores.map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.name}
                    </option>
                  ))}
                </select>
                <label className="admin-checkbox compact">
                  <input
                    type="checkbox"
                    checked={Boolean(edit.isActive)}
                    onChange={(event) => handleEditingChange(String(user.id), 'isActive', event.target.checked)}
                  />
                  {edit.isActive ? 'Ativo' : 'Inativo'}
                </label>
                <div className="admin-user-actions">
                  <input
                    type="password"
                    placeholder="Nova senha"
                    value={edit.password || ''}
                    onChange={(event) => handleEditingChange(String(user.id), 'password', event.target.value)}
                  />
                  <button
                    className="button button-primary"
                    type="button"
                    disabled={savingUserId === user.id}
                    onClick={() => handleUpdateUser(user.id)}
                  >
                    {savingUserId === user.id ? 'Salvando...' : 'Salvar'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default AdminPanel;
