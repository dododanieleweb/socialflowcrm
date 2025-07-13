import React, { useState, useEffect } from 'react';
import { Home, Users, Briefcase, ClipboardList, TrendingUp, Menu, X, Plus, Edit, Trash2 } from 'lucide-react'; // Icone per l'interfaccia

// Firebase Imports
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import {
  getFirestore,
  doc,
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp
} from 'firebase/firestore';

// Global variables provided by the Canvas environment
// These variables are MANDATORY and should always be used as shown.
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// Initialize Firebase App and Services (will be done once in App component)
let app;
let db;
let auth;

// Componente NavItem per la sidebar
const NavItem = ({ icon: Icon, label, section, activeSection, setActiveSection }) => (
  <button
    onClick={() => setActiveSection(section)}
    className={`flex items-center justify-center md:justify-start w-full py-3 px-2 md:px-4 rounded-lg transition-all duration-200
      ${activeSection === section ? 'bg-white bg-opacity-20 shadow-md' : 'hover:bg-white hover:bg-opacity-10'}`}
  >
    <Icon size={24} className="mr-0 md:mr-3" />
    <span className="hidden md:block text-sm font-medium">{label}</span>
  </button>
);

// Contenuto della Dashboard
const DashboardContent = ({ clients, leads, projects, tasks }) => {
  const activeClients = clients.filter(c => c.status === 'Attivo').length;
  const newLeadsMonth = leads.filter(l => {
    // Simple check for leads added in the last 30 days (for demo purposes)
    const leadDate = new Date(l.createdAt?.toDate ? l.createdAt.toDate() : l.createdAt);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    return leadDate >= thirtyDaysAgo;
  }).length;
  const projectsInProgress = projects.filter(p => p.status === 'In Corso').length;
  const overdueTasks = tasks.filter(t => t.status === 'In Sospeso' && new Date(t.dueDate) < new Date()).length;
  const totalLeads = leads.length;
  const convertedLeads = leads.filter(l => l.stage === 'Convertito').length;
  const conversionRate = totalLeads > 0 ? ((convertedLeads / totalLeads) * 100).toFixed(0) : 0;

  // Calculate estimated revenue from active projects
  const estimatedRevenue = projects.reduce((sum, project) => {
    // Only sum up if project has a budget and is not completed/lost
    if (project.budget && project.status !== 'Completato' && project.status !== 'Perso') {
      return sum + project.budget;
    }
    return sum;
  }, 0);


  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <h1 className="text-3xl font-bold text-gray-800 mb-6 col-span-full">Dashboard</h1>
      {/* Schede riassuntive */}
      <div className="bg-white p-6 rounded-xl shadow-md">
        <h2 className="text-lg font-semibold text-gray-700 mb-2">Clienti Attivi</h2>
        <p className="text-4xl font-bold text-blue-600">{activeClients}</p>
      </div>
      <div className="bg-white p-6 rounded-xl shadow-md">
        <h2 className="text-lg font-semibold text-gray-700 mb-2">Nuovi Lead (Mese)</h2>
        <p className="text-4xl font-bold text-green-600">{newLeadsMonth}</p>
      </div>
      <div className="bg-white p-6 rounded-xl shadow-md">
        <h2 className="text-lg font-semibold text-gray-700 mb-2">Progetti in Corso</h2>
        <p className="text-4xl font-bold text-purple-600">{projectsInProgress}</p>
      </div>
      <div className="bg-white p-6 rounded-xl shadow-md">
        <h2 className="text-lg font-semibold text-gray-700 mb-2">Entrate Previste</h2>
        <p className="text-4xl font-bold text-yellow-600">€ {estimatedRevenue.toLocaleString('it-IT')}</p>
      </div>
      <div className="bg-white p-6 rounded-xl shadow-md">
        <h2 className="text-lg font-semibold text-gray-700 mb-2">Attività Scadute</h2>
        <p className="text-4xl font-bold text-red-600">{overdueTasks}</p>
      </div>
      <div className="bg-white p-6 rounded-xl shadow-md">
        <h2 className="text-lg font-semibold text-gray-700 mb-2">Tasso Conversione Lead</h2>
        <p className="text-4xl font-bold text-teal-600">{conversionRate}%</p>
      </div>
    </div>
  );
};

// Modale generico per form
const Modal = ({ children, title, onClose }) => (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
    <div className="bg-white p-6 rounded-xl shadow-xl max-w-lg w-full relative">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold text-gray-800">{title}</h2>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
          <X size={24} />
        </button>
      </div>
      {children}
    </div>
  </div>
);

// Form per aggiungere/modificare un Cliente
const ClientForm = ({ client = {}, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    name: client.name || '',
    contactPerson: client.contactPerson || '',
    email: client.email || '',
    phone: client.phone || '',
    status: client.status || 'Attivo',
    notes: client.notes || '',
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
    onClose();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700">Nome Azienda</label>
        <input type="text" name="name" value={formData.name} onChange={handleChange} required
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Contatto Principale</label>
        <input type="text" name="contactPerson" value={formData.contactPerson} onChange={handleChange} required
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Email</label>
        <input type="email" name="email" value={formData.email} onChange={handleChange} required
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Telefono</label>
        <input type="tel" name="phone" value={formData.phone} onChange={handleChange}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Stato</label>
        <select name="status" value={formData.status} onChange={handleChange}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500">
          <option value="Attivo">Attivo</option>
          <option value="Inattivo">Inattivo</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Note</label>
        <textarea name="notes" value={formData.notes} onChange={handleChange} rows="3"
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"></textarea>
      </div>
      <div className="flex justify-end space-x-3">
        <button type="button" onClick={onClose} className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50">Annulla</button>
        <button type="submit" className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700">Salva Cliente</button>
      </div>
    </form>
  );
};

// Contenuto della sezione Clienti
const ClientsContent = ({ userId, clients, selectedClient, setSelectedClient, projects, addClient, updateClient, deleteClient }) => {
  const [showClientForm, setShowClientForm] = useState(false);
  const [clientToEdit, setClientToEdit] = useState(null);

  const handleAddClick = () => {
    setClientToEdit(null);
    setShowClientForm(true);
  };

  const handleEditClick = (client) => {
    setClientToEdit(client);
    setShowClientForm(true);
  };

  const handleDeleteClick = async (clientId) => {
    if (window.confirm('Sei sicuro di voler eliminare questo cliente? Questa azione è irreversibile.')) {
      try {
        await deleteClient(clientId);
        setSelectedClient(null); // Deseleziona il cliente se viene eliminato
      } catch (error) {
        console.error("Errore durante l'eliminazione del cliente:", error);
        alert("Impossibile eliminare il cliente. Riprova.");
      }
    }
  };

  const handleSaveClient = async (formData) => {
    try {
      if (clientToEdit) {
        await updateClient(clientToEdit.id, formData);
      } else {
        await addClient(formData);
      }
      setShowClientForm(false);
      setClientToEdit(null);
    } catch (error) {
      console.error("Errore durante il salvataggio del cliente:", error);
      alert("Impossibile salvare il cliente. Riprova.");
    }
  };

  return (
    <div className="flex flex-col md:flex-row h-full">
      {/* Titolo e pulsante Aggiungi per mobile */}
      <div className="flex justify-between items-center mb-6 md:hidden">
        <h1 className="text-3xl font-bold text-gray-800">Clienti</h1>
        <button onClick={handleAddClick} className="p-2 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700">
          <Plus size={24} />
        </button>
      </div>

      {/* Lista Clienti */}
      <div className={`w-full md:w-1/3 p-4 bg-white rounded-xl shadow-md overflow-y-auto ${selectedClient && !showClientForm ? 'hidden md:block' : ''}`}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-800">Elenco Clienti</h2>
          <button onClick={handleAddClick} className="hidden md:block p-2 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700">
            <Plus size={24} />
          </button>
        </div>
        {clients.length === 0 ? (
          <p className="text-gray-500 text-center py-4">Nessun cliente trovato. Aggiungine uno!</p>
        ) : (
          clients.map(client => (
            <button
              key={client.id}
              onClick={() => setSelectedClient(client)}
              className={`w-full text-left p-4 mb-2 rounded-lg transition-all duration-200 flex items-center justify-between
                ${selectedClient?.id === client.id ? 'bg-blue-100 border border-blue-300' : 'hover:bg-gray-50'}`}
            >
              <div>
                <h3 className="font-semibold text-blue-700">{client.name}</h3>
                <p className="text-sm text-gray-600">{client.contactPerson}</p>
              </div>
              <div className="flex space-x-2">
                <button onClick={(e) => { e.stopPropagation(); handleEditClick(client); }} className="text-gray-500 hover:text-blue-600 p-1 rounded-md">
                  <Edit size={18} />
                </button>
                <button onClick={(e) => { e.stopPropagation(); handleDeleteClick(client.id); }} className="text-gray-500 hover:text-red-600 p-1 rounded-md">
                  <Trash2 size={18} />
                </button>
              </div>
            </button>
          ))
        )}
      </div>

      {/* Dettaglio Cliente / Form Cliente */}
      {showClientForm ? (
        <Modal title={clientToEdit ? "Modifica Cliente" : "Aggiungi Nuovo Cliente"} onClose={() => setShowClientForm(false)}>
          <ClientForm client={clientToEdit} onClose={() => setShowClientForm(false)} onSave={handleSaveClient} />
        </Modal>
      ) : selectedClient ? (
        <div className="w-full md:w-2/3 md:ml-6 p-6 bg-white rounded-xl shadow-md overflow-y-auto">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold text-gray-800">{selectedClient.name}</h2>
            <div className="flex space-x-2">
              <button onClick={() => handleEditClick(selectedClient)} className="text-gray-500 hover:text-blue-600 p-1 rounded-md">
                <Edit size={24} />
              </button>
              <button onClick={() => handleDeleteClick(selectedClient.id)} className="text-gray-500 hover:text-red-600 p-1 rounded-md">
                <Trash2 size={24} />
              </button>
              <button onClick={() => setSelectedClient(null)} className="text-gray-500 hover:text-gray-700 md:hidden">
                <X size={24} />
              </button>
            </div>
          </div>
          <p className="text-gray-600 mb-4">{selectedClient.notes}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div>
              <p className="text-sm font-medium text-gray-500">Contatto Principale:</p>
              <p className="text-gray-800">{selectedClient.contactPerson}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Email:</p>
              <p className="text-blue-600">{selectedClient.email}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Telefono:</p>
              <p className="text-gray-800">{selectedClient.phone}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Stato:</p>
              <p className={`font-semibold ${selectedClient.status === 'Attivo' ? 'text-green-600' : 'text-red-600'}`}>
                {selectedClient.status}
              </p>
            </div>
          </div>

          <h3 className="text-xl font-semibold text-gray-800 mb-3">Progetti Associati</h3>
          {projects.filter(p => p.clientId === selectedClient.id).length > 0 ? (
            <div className="space-y-2">
              {projects.filter(p => p.clientId === selectedClient.id).map(project => (
                <div key={project.id} className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                  <p className="font-medium text-blue-700">{project.name}</p>
                  <p className="text-sm text-gray-600">Stato: {project.status}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500">Nessun progetto associato.</p>
          )}
        </div>
      ) : (
        <div className="w-full md:w-2/3 md:ml-6 p-6 bg-white rounded-xl shadow-md flex items-center justify-center text-gray-500">
          Seleziona un cliente per visualizzare i dettagli o aggiungine uno nuovo.
        </div>
      )}
    </div>
  );
};

// Form per aggiungere/modificare un Lead
const LeadForm = ({ lead = {}, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    name: lead.name || '',
    contactPerson: lead.contactPerson || '',
    email: lead.email || '',
    phone: lead.phone || '',
    stage: lead.stage || 'Nuovo',
    source: lead.source || '',
    notes: lead.notes || '',
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
    onClose();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700">Nome Lead</label>
        <input type="text" name="name" value={formData.name} onChange={handleChange} required
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Contatto Principale</label>
        <input type="text" name="contactPerson" value={formData.contactPerson} onChange={handleChange} required
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Email</label>
        <input type="email" name="email" value={formData.email} onChange={handleChange} required
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Telefono</label>
        <input type="tel" name="phone" value={formData.phone} onChange={handleChange}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Fase</label>
        <select name="stage" value={formData.stage} onChange={handleChange}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500">
          <option value="Nuovo">Nuovo</option>
          <option value="Qualificato">Qualificato</option>
          <option value="Proposta Inviata">Proposta Inviata</option>
          <option value="Negoziato">Negoziato</option>
          <option value="Convertito">Convertito</option>
          <option value="Perso">Perso</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Fonte</label>
        <input type="text" name="source" value={formData.source} onChange={handleChange}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Note</label>
        <textarea name="notes" value={formData.notes} onChange={handleChange} rows="3"
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"></textarea>
      </div>
      <div className="flex justify-end space-x-3">
        <button type="button" onClick={onClose} className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50">Annulla</button>
        <button type="submit" className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700">Salva Lead</button>
      </div>
    </form>
  );
};

// Contenuto della sezione Lead (stile Kanban)
const LeadsContent = ({ userId, leads, setLeads, selectedLead, setSelectedLead, addLead, updateLead, deleteLead }) => {
  const stages = ['Nuovo', 'Qualificato', 'Proposta Inviata', 'Negoziato', 'Convertito', 'Perso'];
  const [showLeadForm, setShowLeadForm] = useState(false);
  const [leadToEdit, setLeadToEdit] = useState(null);

  const handleAddClick = () => {
    setLeadToEdit(null);
    setShowLeadForm(true);
  };

  const handleEditClick = (lead) => {
    setLeadToEdit(lead);
    setShowLeadForm(true);
  };

  const handleDeleteClick = async (leadId) => {
    if (window.confirm('Sei sicuro di voler eliminare questo lead? Questa azione è irreversibile.')) {
      try {
        await deleteLead(leadId);
        setSelectedLead(null);
      } catch (error) {
        console.error("Errore durante l'eliminazione del lead:", error);
        alert("Impossibile eliminare il lead. Riprova.");
      }
    }
  };

  const handleSaveLead = async (formData) => {
    try {
      if (leadToEdit) {
        await updateLead(leadToEdit.id, formData);
      } else {
        await addLead(formData);
      }
      setShowLeadForm(false);
      setLeadToEdit(null);
    } catch (error) {
      console.error("Errore durante il salvataggio del lead:", error);
      alert("Impossibile salvare il lead. Riprova.");
    }
  };

  const handleDragStart = (e, leadId) => {
    e.dataTransfer.setData('leadId', leadId);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = async (e, newStage) => {
    const leadId = e.dataTransfer.getData('leadId');
    const leadToUpdate = leads.find(lead => lead.id === leadId);
    if (leadToUpdate && leadToUpdate.stage !== newStage) {
      try {
        await updateLead(leadId, { stage: newStage });
        setSelectedLead(null);
      } catch (error) {
        console.error("Errore durante l'aggiornamento della fase del lead:", error);
        alert("Impossibile aggiornare la fase del lead. Riprova.");
      }
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-800">Pipeline Lead</h1>
        <button onClick={handleAddClick} className="p-2 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700">
          <Plus size={24} />
        </button>
      </div>

      <div className="flex flex-grow overflow-x-auto pb-4 -mx-2">
        {stages.map(stage => (
          <div
            key={stage}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, stage)}
            className="flex-shrink-0 w-80 bg-gray-200 p-4 rounded-xl shadow-inner mx-2"
          >
            <h2 className="text-lg font-semibold text-gray-800 mb-4 border-b pb-2 border-gray-300">{stage}</h2>
            <div className="space-y-3">
              {leads.filter(lead => lead.stage === stage).map(lead => (
                <div
                  key={lead.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, lead.id)}
                  onClick={() => setSelectedLead(lead)}
                  className={`bg-white p-4 rounded-lg shadow-md cursor-grab active:cursor-grabbing transition-all duration-200
                    ${selectedLead?.id === lead.id ? 'border-2 border-blue-500' : 'hover:shadow-lg'}`}
                >
                  <h3 className="font-semibold text-blue-700">{lead.name}</h3>
                  <p className="text-sm text-gray-600">{lead.contactPerson}</p>
                  <p className="text-xs text-gray-500 mt-1">Fonte: {lead.source}</p>
                  <div className="flex justify-end space-x-2 mt-2">
                    <button onClick={(e) => { e.stopPropagation(); handleEditClick(lead); }} className="text-gray-500 hover:text-blue-600 p-1 rounded-md">
                      <Edit size={16} />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); handleDeleteClick(lead.id); }} className="text-gray-500 hover:text-red-600 p-1 rounded-md">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Dettaglio Lead (Modale) / Form Lead */}
      {showLeadForm ? (
        <Modal title={leadToEdit ? "Modifica Lead" : "Aggiungi Nuovo Lead"} onClose={() => setShowLeadForm(false)}>
          <LeadForm lead={leadToEdit} onClose={() => setShowLeadForm(false)} onSave={handleSaveLead} />
        </Modal>
      ) : selectedLead && (
        <Modal title={selectedLead.name} onClose={() => setSelectedLead(null)}>
          <p className="text-gray-600 mb-4">{selectedLead.notes}</p>
          <div className="grid grid-cols-1 gap-2 mb-4">
            <div>
              <p className="text-sm font-medium text-gray-500">Contatto:</p>
              <p className="text-gray-800">{selectedLead.contactPerson}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Email:</p>
              <p className="text-blue-600">{selectedLead.email}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Telefono:</p>
              <p className="text-gray-800">{selectedLead.phone}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Fase:</p>
              <p className="font-semibold text-purple-600">{selectedLead.stage}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Fonte:</p>
              <p className="text-gray-800">{selectedLead.source}</p>
            </div>
          </div>
          <div className="flex justify-end space-x-3">
            <button onClick={() => handleEditClick(selectedLead)} className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 flex items-center space-x-1">
              <Edit size={18} /> <span>Modifica</span>
            </button>
            <button onClick={() => handleDeleteClick(selectedLead.id)} className="px-4 py-2 rounded-md bg-red-600 text-white hover:bg-red-700 flex items-center space-x-1">
              <Trash2 size={18} /> <span>Elimina</span>
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
};

// Form per aggiungere/modificare un Progetto
const ProjectForm = ({ project = {}, onClose, onSave, clients }) => {
  const [formData, setFormData] = useState({
    clientId: project.clientId || '',
    name: project.name || '',
    status: project.status || 'In Corso',
    startDate: project.startDate || '',
    endDate: project.endDate || '',
    budget: project.budget || 0,
    description: project.description || '',
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: name === 'budget' ? Number(value) : value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
    onClose();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700">Cliente</label>
        <select name="clientId" value={formData.clientId} onChange={handleChange} required
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500">
          <option value="">Seleziona un cliente</option>
          {clients.map(client => (
            <option key={client.id} value={client.id}>{client.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Nome Progetto</label>
        <input type="text" name="name" value={formData.name} onChange={handleChange} required
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Stato</label>
        <select name="status" value={formData.status} onChange={handleChange}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500">
          <option value="In Corso">In Corso</option>
          <option value="Completato">Completato</option>
          <option value="In Pausa">In Pausa</option>
          <option value="Cancellato">Cancellato</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Data Inizio</label>
          <input type="date" name="startDate" value={formData.startDate} onChange={handleChange}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Data Fine</label>
          <input type="date" name="endDate" value={formData.endDate} onChange={handleChange}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Budget (€)</label>
        <input type="number" name="budget" value={formData.budget} onChange={handleChange}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Descrizione</label>
        <textarea name="description" value={formData.description} onChange={handleChange} rows="3"
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"></textarea>
      </div>
      <div className="flex justify-end space-x-3">
        <button type="button" onClick={onClose} className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50">Annulla</button>
        <button type="submit" className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700">Salva Progetto</button>
      </div>
    </form>
  );
};

// Contenuto della sezione Progetti
const ProjectsContent = ({ userId, projects, selectedProject, setSelectedProject, clients, tasks, addProject, updateProject, deleteProject }) => {
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [projectToEdit, setProjectToEdit] = useState(null);

  const handleAddClick = () => {
    setProjectToEdit(null);
    setShowProjectForm(true);
  };

  const handleEditClick = (project) => {
    setProjectToEdit(project);
    setShowProjectForm(true);
  };

  const handleDeleteClick = async (projectId) => {
    if (window.confirm('Sei sicuro di voler eliminare questo progetto? Questa azione è irreversibile.')) {
      try {
        await deleteProject(projectId);
        setSelectedProject(null);
      } catch (error) {
        console.error("Errore durante l'eliminazione del progetto:", error);
        alert("Impossibile eliminare il progetto. Riprova.");
      }
    }
  };

  const handleSaveProject = async (formData) => {
    try {
      if (projectToEdit) {
        await updateProject(projectToEdit.id, formData);
      } else {
        await addProject(formData);
      }
      setShowProjectForm(false);
      setProjectToEdit(null);
    } catch (error) {
      console.error("Errore durante il salvataggio del progetto:", error);
      alert("Impossibile salvare il progetto. Riprova.");
    }
  };

  return (
    <div className="flex flex-col md:flex-row h-full">
      {/* Titolo e pulsante Aggiungi per mobile */}
      <div className="flex justify-between items-center mb-6 md:hidden">
        <h1 className="text-3xl font-bold text-gray-800">Progetti</h1>
        <button onClick={handleAddClick} className="p-2 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700">
          <Plus size={24} />
        </button>
      </div>

      {/* Lista Progetti */}
      <div className={`w-full md:w-1/3 p-4 bg-white rounded-xl shadow-md overflow-y-auto ${selectedProject && !showProjectForm ? 'hidden md:block' : ''}`}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-800">Elenco Progetti</h2>
          <button onClick={handleAddClick} className="hidden md:block p-2 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700">
            <Plus size={24} />
          </button>
        </div>
        {projects.length === 0 ? (
          <p className="text-gray-500 text-center py-4">Nessun progetto trovato. Aggiungine uno!</p>
        ) : (
          projects.map(project => (
            <button
              key={project.id}
              onClick={() => setSelectedProject(project)}
              className={`w-full text-left p-4 mb-2 rounded-lg transition-all duration-200 flex items-center justify-between
                ${selectedProject?.id === project.id ? 'bg-blue-100 border border-blue-300' : 'hover:bg-gray-50'}`}
            >
              <div>
                <h3 className="font-semibold text-blue-700">{project.name}</h3>
                <p className="text-sm text-gray-600">Cliente: {clients.find(c => c.id === project.clientId)?.name || 'N/A'}</p>
              </div>
              <div className="flex space-x-2">
                <button onClick={(e) => { e.stopPropagation(); handleEditClick(project); }} className="text-gray-500 hover:text-blue-600 p-1 rounded-md">
                  <Edit size={18} />
                </button>
                <button onClick={(e) => { e.stopPropagation(); handleDeleteClick(project.id); }} className="text-gray-500 hover:text-red-600 p-1 rounded-md">
                  <Trash2 size={18} />
                </button>
              </div>
            </button>
          ))
        )}
      </div>

      {/* Dettaglio Progetto / Form Progetto */}
      {showProjectForm ? (
        <Modal title={projectToEdit ? "Modifica Progetto" : "Aggiungi Nuovo Progetto"} onClose={() => setShowProjectForm(false)}>
          <ProjectForm project={projectToEdit} onClose={() => setShowProjectForm(false)} onSave={handleSaveProject} clients={clients} />
        </Modal>
      ) : selectedProject ? (
        <div className="w-full md:w-2/3 md:ml-6 p-6 bg-white rounded-xl shadow-md overflow-y-auto">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold text-gray-800">{selectedProject.name}</h2>
            <div className="flex space-x-2">
              <button onClick={() => handleEditClick(selectedProject)} className="text-gray-500 hover:text-blue-600 p-1 rounded-md">
                <Edit size={24} />
              </button>
              <button onClick={() => handleDeleteClick(selectedProject.id)} className="text-gray-500 hover:text-red-600 p-1 rounded-md">
                <Trash2 size={24} />
              </button>
              <button onClick={() => setSelectedProject(null)} className="text-gray-500 hover:text-gray-700 md:hidden">
                <X size={24} />
              </button>
            </div>
          </div>
          <p className="text-gray-600 mb-4">{selectedProject.description}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div>
              <p className="text-sm font-medium text-gray-500">Cliente:</p>
              <p className="text-gray-800">{clients.find(c => c.id === selectedProject.clientId)?.name || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Stato:</p>
              <p className={`font-semibold ${selectedProject.status === 'In Corso' ? 'text-green-600' : 'text-blue-600'}`}>
                {selectedProject.status}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Data Inizio:</p>
              <p className="text-gray-800">{selectedProject.startDate}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Data Fine:</p>
              <p className="text-gray-800">{selectedProject.endDate}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Budget:</p>
              <p className="text-gray-800">€ {selectedProject.budget.toLocaleString('it-IT')}</p>
            </div>
          </div>

          <h3 className="text-xl font-semibold text-gray-800 mb-3">Attività Associate</h3>
          {tasks.filter(t => t.projectId === selectedProject.id).length > 0 ? (
            <div className="space-y-2">
              {tasks.filter(t => t.projectId === selectedProject.id).map(task => (
                <div key={task.id} className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                  <p className="font-medium text-gray-800">{task.description}</p>
                  <p className="text-sm text-gray-600">Scadenza: {task.dueDate}</p>
                  <p className="text-sm text-gray-600">Stato: {task.status}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500">Nessuna attività associata.</p>
          )}
        </div>
      ) : (
        <div className="w-full md:w-2/3 md:ml-6 p-6 bg-white rounded-xl shadow-md flex items-center justify-center text-gray-500">
          Seleziona un progetto per visualizzare i dettagli o aggiungine uno nuovo.
        </div>
      )}
    </div>
  );
};

// Form per aggiungere/modificare un Task
const TaskForm = ({ task = {}, onClose, onSave, projects }) => {
  const [formData, setFormData] = useState({
    projectId: task.projectId || '',
    description: task.description || '',
    dueDate: task.dueDate || '',
    status: task.status || 'In Sospeso',
    assignedTo: task.assignedTo || '',
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
    onClose();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700">Progetto</label>
        <select name="projectId" value={formData.projectId} onChange={handleChange} required
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500">
          <option value="">Seleziona un progetto</option>
          {projects.map(project => (
            <option key={project.id} value={project.id}>{project.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Descrizione</label>
        <input type="text" name="description" value={formData.description} onChange={handleChange} required
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Scadenza</label>
        <input type="date" name="dueDate" value={formData.dueDate} onChange={handleChange} required
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Stato</label>
        <select name="status" value={formData.status} onChange={handleChange}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500">
          <option value="In Sospeso">In Sospeso</option>
          <option value="Completata">Completata</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Assegnato a</label>
        <input type="text" name="assignedTo" value={formData.assignedTo} onChange={handleChange}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500" />
      </div>
      <div className="flex justify-end space-x-3">
        <button type="button" onClick={onClose} className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50">Annulla</button>
        <button type="submit" className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700">Salva Attività</button>
      </div>
    </form>
  );
};

// Contenuto della sezione Attività
const TasksContent = ({ userId, tasks, setTasks, projects, addTask, updateTask, deleteTask }) => {
  const [filterStatus, setFilterStatus] = useState('Tutte');
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskToEdit, setTaskToEdit] = useState(null);

  const filteredTasks = tasks.filter(task => {
    if (filterStatus === 'Tutte') return true;
    return task.status === filterStatus;
  });

  const handleAddClick = () => {
    setTaskToEdit(null);
    setShowTaskForm(true);
  };

  const handleEditClick = (task) => {
    setTaskToEdit(task);
    setShowTaskForm(true);
  };

  const handleDeleteClick = async (taskId) => {
    if (window.confirm('Sei sicuro di voler eliminare questa attività? Questa azione è irreversibile.')) {
      try {
        await deleteTask(taskId);
      } catch (error) {
        console.error("Errore durante l'eliminazione dell'attività:", error);
        alert("Impossibile eliminare l'attività. Riprova.");
      }
    }
  };

  const handleSaveTask = async (formData) => {
    try {
      if (taskToEdit) {
        await updateTask(taskToEdit.id, formData);
      } else {
        await addTask(formData);
      }
      setShowTaskForm(false);
      setTaskToEdit(null);
    } catch (error) {
      console.error("Errore durante il salvataggio dell'attività:", error);
      alert("Impossibile salvare l'attività. Riprova.");
    }
  };

  const toggleTaskStatus = async (id, currentStatus) => {
    const newStatus = currentStatus === 'In Sospeso' ? 'Completata' : 'In Sospeso';
    try {
      await updateTask(id, { status: newStatus });
    } catch (error) {
      console.error("Errore durante l'aggiornamento dello stato dell'attività:", error);
      alert("Impossibile aggiornare lo stato dell'attività. Riprova.");
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-800">Attività</h1>
        <button onClick={handleAddClick} className="p-2 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700">
          <Plus size={24} />
        </button>
      </div>

      {/* Filtri per stato attività */}
      <div className="mb-6 flex space-x-4 overflow-x-auto pb-2">
        <button
          onClick={() => setFilterStatus('Tutte')}
          className={`py-2 px-4 rounded-lg font-medium transition-colors duration-200 whitespace-nowrap
            ${filterStatus === 'Tutte' ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
        >
          Tutte
        </button>
        <button
          onClick={() => setFilterStatus('In Sospeso')}
          className={`py-2 px-4 rounded-lg font-medium transition-colors duration-200 whitespace-nowrap
            ${filterStatus === 'In Sospeso' ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
        >
          In Sospeso
        </button>
        <button
          onClick={() => setFilterStatus('Completata')}
          className={`py-2 px-4 rounded-lg font-medium transition-colors duration-200 whitespace-nowrap
            ${filterStatus === 'Completata' ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
        >
          Completate
        </button>
      </div>

      {/* Elenco attività */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto">
        {filteredTasks.length === 0 ? (
          <p className="col-span-full text-center text-gray-500 p-8">Nessuna attività trovata per il filtro selezionato.</p>
        ) : (
          filteredTasks.map(task => (
            <div key={task.id} className="bg-white p-5 rounded-xl shadow-md flex flex-col justify-between">
              <div>
                <h3 className="font-semibold text-gray-800 text-lg mb-2">{task.description}</h3>
                <p className="text-sm text-gray-600 mb-1">
                  Progetto: {projects.find(p => p.id === task.projectId)?.name || 'N/A'}
                </p>
                <p className="text-sm text-gray-600 mb-3">Scadenza: {task.dueDate}</p>
              </div>
              <div className="flex items-center justify-between mt-auto">
                <span className={`text-sm font-semibold ${task.status === 'Completata' ? 'text-green-600' : 'text-orange-600'}`}>
                  {task.status}
                </span>
                <div className="flex space-x-2">
                  <button
                    onClick={() => toggleTaskStatus(task.id, task.status)}
                    className={`py-1 px-3 rounded-full text-white text-sm font-medium transition-colors duration-200
                      ${task.status === 'In Sospeso' ? 'bg-green-500 hover:bg-green-600' : 'bg-orange-500 hover:bg-orange-600'}`}
                  >
                    {task.status === 'In Sospeso' ? 'Completa' : 'Ripristina'}
                  </button>
                  <button onClick={() => handleEditClick(task)} className="text-gray-500 hover:text-blue-600 p-1 rounded-md">
                    <Edit size={18} />
                  </button>
                  <button onClick={() => handleDeleteClick(task.id)} className="text-gray-500 hover:text-red-600 p-1 rounded-md">
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Form Task */}
      {showTaskForm && (
        <Modal title={taskToEdit ? "Modifica Attività" : "Aggiungi Nuova Attività"} onClose={() => setShowTaskForm(false)}>
          <TaskForm task={taskToEdit} onClose={() => setShowTaskForm(false)} onSave={handleSaveTask} projects={projects} />
        </Modal>
      )}
    </div>
  );
};


function App() {
  const [activeSection, setActiveSection] = useState('dashboard');
  const [selectedClient, setSelectedClient] = useState(null);
  const [selectedLead, setSelectedLead] = useState(null);
  const [selectedProject, setSelectedProject] = useState(null);

  // Stato per i dati da Firestore
  const [clients, setClients] = useState([]);
  const [leads, setLeads] = useState([]);
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);

  // Stato per l'autenticazione e il caricamento
  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false); // Indicates if onAuthStateChanged has completed its initial check

  // Firebase Initialization and Authentication
  useEffect(() => {
    try {
      app = initializeApp(firebaseConfig);
      db = getFirestore(app);
      auth = getAuth(app);

      const unsubscribe = onAuthStateChanged(auth, async (user) => {
        if (user) {
          setUserId(user.uid);
        } else {
          // Sign in anonymously if no user is authenticated
          try {
            if (initialAuthToken) {
              await signInWithCustomToken(auth, initialAuthToken);
            } else {
              await signInAnonymously(auth);
            }
          } catch (error) {
            console.error("Firebase Auth Error:", error);
            // Fallback to a random ID if anonymous sign-in fails
            setUserId(crypto.randomUUID());
          }
        }
        setAuthReady(true); // Authentication state has been checked
        setLoading(false);
      });

      return () => unsubscribe(); // Cleanup auth listener on unmount
    } catch (error) {
      console.error("Firebase initialization error:", error);
      setLoading(false);
      setAuthReady(true);
      setUserId(crypto.randomUUID()); // Fallback to random ID if Firebase init fails
    }
  }, []); // Run only once on component mount

  // Firestore Data Listeners
  useEffect(() => {
    if (!authReady || !userId) return; // Only fetch data once auth is ready and userId is set

    // Define base collection path for private data
    const getCollectionPath = (collectionName) => `/artifacts/${appId}/users/${userId}/${collectionName}`;

    // Clients Listener
    const clientsColRef = collection(db, getCollectionPath('clients'));
    const unsubscribeClients = onSnapshot(clientsColRef, (snapshot) => {
      const clientsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setClients(clientsData);
    }, (error) => console.error("Error fetching clients:", error));

    // Leads Listener
    const leadsColRef = collection(db, getCollectionPath('leads'));
    const unsubscribeLeads = onSnapshot(leadsColRef, (snapshot) => {
      const leadsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setLeads(leadsData);
    }, (error) => console.error("Error fetching leads:", error));

    // Projects Listener
    const projectsColRef = collection(db, getCollectionPath('projects'));
    const unsubscribeProjects = onSnapshot(projectsColRef, (snapshot) => {
      const projectsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setProjects(projectsData);
    }, (error) => console.error("Error fetching projects:", error));

    // Tasks Listener
    const tasksColRef = collection(db, getCollectionPath('tasks'));
    const unsubscribeTasks = onSnapshot(tasksColRef, (snapshot) => {
      const tasksData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTasks(tasksData);
    }, (error) => console.error("Error fetching tasks:", error));

    // Cleanup listeners on unmount or userId change
    return () => {
      unsubscribeClients();
      unsubscribeLeads();
      unsubscribeProjects();
      unsubscribeTasks();
    };
  }, [authReady, userId]); // Re-run when authReady or userId changes

  // CRUD Operations for Clients
  const addClient = async (clientData) => {
    const clientsColRef = collection(db, `/artifacts/${appId}/users/${userId}/clients`);
    await addDoc(clientsColRef, { ...clientData, createdAt: serverTimestamp() });
  };
  const updateClient = async (id, clientData) => {
    const clientDocRef = doc(db, `/artifacts/${appId}/users/${userId}/clients`, id);
    await updateDoc(clientDocRef, clientData);
  };
  const deleteClient = async (id) => {
    const clientDocRef = doc(db, `/artifacts/${appId}/users/${userId}/clients`, id);
    await deleteDoc(clientDocRef);
  };

  // CRUD Operations for Leads
  const addLead = async (leadData) => {
    const leadsColRef = collection(db, `/artifacts/${appId}/users/${userId}/leads`);
    await addDoc(leadsColRef, { ...leadData, createdAt: serverTimestamp() });
  };
  const updateLead = async (id, leadData) => {
    const leadDocRef = doc(db, `/artifacts/${appId}/users/${userId}/leads`, id);
    await updateDoc(leadDocRef, leadData);
  };
  const deleteLead = async (id) => {
    const leadDocRef = doc(db, `/artifacts/${appId}/users/${userId}/leads`, id);
    await deleteDoc(leadDocRef);
  };

  // CRUD Operations for Projects
  const addProject = async (projectData) => {
    const projectsColRef = collection(db, `/artifacts/${appId}/users/${userId}/projects`);
    await addDoc(projectsColRef, { ...projectData, createdAt: serverTimestamp() });
  };
  const updateProject = async (id, projectData) => {
    const projectDocRef = doc(db, `/artifacts/${appId}/users/${userId}/projects`, id);
    await updateDoc(projectDocRef, projectData);
  };
  const deleteProject = async (id) => {
    const projectDocRef = doc(db, `/artifacts/${appId}/users/${userId}/projects`, id);
    await deleteDoc(projectDocRef);
  };

  // CRUD Operations for Tasks
  const addTask = async (taskData) => {
    const tasksColRef = collection(db, `/artifacts/${appId}/users/${userId}/tasks`);
    await addDoc(tasksColRef, { ...taskData, createdAt: serverTimestamp() });
  };
  const updateTask = async (id, taskData) => {
    const taskDocRef = doc(db, `/artifacts/${appId}/users/${userId}/tasks`, id);
    await updateDoc(taskDocRef, taskData);
  };
  const deleteTask = async (id) => {
    const taskDocRef = doc(db, `/artifacts/${appId}/users/${userId}/tasks`, id);
    await deleteDoc(taskDocRef);
  };


  // Funzione per renderizzare il contenuto della sezione attiva
  const renderContent = () => {
    if (loading || !authReady) {
      return (
        <div className="flex justify-center items-center h-full text-gray-600 text-xl">
          Caricamento dati...
        </div>
      );
    }

    switch (activeSection) {
      case 'dashboard':
        return <DashboardContent clients={clients} leads={leads} projects={projects} tasks={tasks} />;
      case 'clients':
        return (
          <ClientsContent
            userId={userId}
            clients={clients}
            selectedClient={selectedClient}
            setSelectedClient={setSelectedClient}
            projects={projects}
            addClient={addClient}
            updateClient={updateClient}
            deleteClient={deleteClient}
          />
        );
      case 'leads':
        return (
          <LeadsContent
            userId={userId}
            leads={leads}
            setLeads={setLeads} // Keep setLeads for local state updates if needed, though Firestore will re-render
            selectedLead={selectedLead}
            setSelectedLead={setSelectedLead}
            addLead={addLead}
            updateLead={updateLead}
            deleteLead={deleteLead}
          />
        );
      case 'projects':
        return (
          <ProjectsContent
            userId={userId}
            projects={projects}
            selectedProject={selectedProject}
            setSelectedProject={setSelectedProject}
            clients={clients}
            tasks={tasks}
            addProject={addProject}
            updateProject={updateProject}
            deleteProject={deleteProject}
          />
        );
      case 'tasks':
        return (
          <TasksContent
            userId={userId}
            tasks={tasks}
            setTasks={setTasks} // Keep setTasks for local state updates if needed, though Firestore will re-render
            projects={projects}
            addTask={addTask}
            updateTask={updateTask}
            deleteTask={deleteTask}
          />
        );
      default:
        return <DashboardContent clients={clients} leads={leads} projects={projects} tasks={tasks} />;
    }
  };

  return (
    // Contenitore principale dell'applicazione con stile globale
    <div className="flex h-screen bg-gray-100 font-inter">
      {/* Sidebar di navigazione */}
      <aside className="w-20 md:w-64 bg-gradient-to-br from-blue-600 to-purple-700 text-white flex flex-col items-center py-4 shadow-lg rounded-r-2xl">
        {/* Logo/Nome app */}
        <div className="mb-8 text-2xl font-bold hidden md:block">SocialFlow</div>
        <div className="mb-8 text-2xl font-bold md:hidden">SF</div>
        {/* Elementi di navigazione */}
        <nav className="flex flex-col space-y-4 w-full">
          <NavItem icon={Home} label="Dashboard" section="dashboard" activeSection={activeSection} setActiveSection={setActiveSection} />
          <NavItem icon={Users} label="Clienti" section="clients" activeSection={activeSection} setActiveSection={setActiveSection} />
          <NavItem icon={TrendingUp} label="Lead" section="leads" activeSection={activeSection} setActiveSection={setActiveSection} />
          <NavItem icon={Briefcase} label="Progetti" section="projects" activeSection={activeSection} setActiveSection={setActiveSection} />
          <NavItem icon={ClipboardList} label="Attività" section="tasks" activeSection={activeSection} setActiveSection={setActiveSection} />
        </nav>
        {/* Display User ID for multi-user context */}
        {userId && (
          <div className="mt-auto p-2 text-xs text-gray-200 text-center break-all">
            User ID: {userId}
          </div>
        )}
      </aside>

      {/* Area del contenuto principale */}
      <main className="flex-1 p-6 overflow-auto">
        {renderContent()}
      </main>
    </div>
  );
}

export default App;
