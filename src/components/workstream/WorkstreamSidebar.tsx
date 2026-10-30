import React from 'react';
import { Search, FolderKanban, Users, Shield, Star, Inbox, MessageSquare, Clock, CheckCircle2, Archive, PackageCheck } from 'lucide-react';
import { UserAccount, Project } from '../../types';
import { WorkstreamFilter, WorkstreamItem, WORKSTREAM_TAB_STATUSES } from './types';

interface WorkstreamSidebarProps {
  currentTab: WorkstreamFilter;
  onTabChange: (tab: WorkstreamFilter) => void;
  orders: WorkstreamItem[];
  starredCount: number;
  projects?: Project[];
  usersList?: UserAccount[];
  currentUser?: UserAccount | null;
  selectedPersonFilter: string | null;
  onSelectPersonFilter: (userId: string | null) => void;
  peopleSearch: string;
  onPeopleSearchChange: (val: string) => void;
  projectSearch: string;
  onProjectSelect: (title: string) => void;
}

export const WorkstreamSidebar: React.FC<WorkstreamSidebarProps> = ({
  currentTab,
  onTabChange,
  orders,
  starredCount,
  projects = [],
  usersList = [],
  currentUser,
  selectedPersonFilter,
  onSelectPersonFilter,
  peopleSearch,
  onPeopleSearchChange,
  projectSearch,
  onProjectSelect
}) => {
  const filterCounts = {
    all: orders.length,
    inbox: orders.filter(o => (WORKSTREAM_TAB_STATUSES.inbox as readonly string[]).includes(o.status)).length,
    in_progress: orders.filter(o => (WORKSTREAM_TAB_STATUSES.in_progress as readonly string[]).includes(o.status)).length,
    delivered: orders.filter(o => (WORKSTREAM_TAB_STATUSES.delivered as readonly string[]).includes(o.status)).length,
    completed: orders.filter(o => (WORKSTREAM_TAB_STATUSES.completed as readonly string[]).includes(o.status)).length,
    starred: starredCount,
    escrow: orders.filter(o => o.amount > 0 && !['cancelled', 'completed'].includes(o.status)).length,
    archived: orders.filter(o => (WORKSTREAM_TAB_STATUSES.archived as readonly string[]).includes(o.status)).length
  };

  const filterTabs: Array<{ id: WorkstreamFilter; label: string; icon: React.ReactNode; count: number }> = [
    { id: 'all', label: 'All Workstreams', icon: <Inbox className="w-3.5 h-3.5" />, count: filterCounts.all },
    { id: 'inbox', label: 'Active Inbox', icon: <MessageSquare className="w-3.5 h-3.5" />, count: filterCounts.inbox },
    { id: 'in_progress', label: 'Work in Progress', icon: <Clock className="w-3.5 h-3.5 text-blue-500" />, count: filterCounts.in_progress },
    { id: 'delivered', label: 'Delivered', icon: <PackageCheck className="w-3.5 h-3.5 text-amber-500" />, count: filterCounts.delivered },
    { id: 'completed', label: 'Completed', icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />, count: filterCounts.completed },
    { id: 'starred', label: 'Starred', icon: <Star className="w-3.5 h-3.5 text-yellow-500" />, count: filterCounts.starred },
    { id: 'escrow', label: 'With Escrow', icon: <Shield className="w-3.5 h-3.5 text-emerald-500" />, count: filterCounts.escrow },
    { id: 'archived', label: 'Archived', icon: <Archive className="w-3.5 h-3.5 text-slate-400" />, count: filterCounts.archived }
  ];

  const filteredPeople = [...usersList]
    .filter(u => u.id !== currentUser?.id)
    .filter(p => !peopleSearch || p.name.toLowerCase().includes(peopleSearch.toLowerCase()) || (p.title && p.title.toLowerCase().includes(peopleSearch.toLowerCase())))
    .sort((a, b) => {
      const aCount = orders.filter(o => o.sellerId === a.id || o.buyerId === a.id).length;
      const bCount = orders.filter(o => o.sellerId === b.id || o.buyerId === b.id).length;
      return bCount - aCount;
    })
    .slice(0, 15);

  const projectsWithCounts = projects.map(p => {
    const count = orders.filter(o => 
      o.projectId === p.id || 
      o.title.toLowerCase().includes(p.title.toLowerCase())
    ).length;
    return { ...p, relatedCount: count };
  }).sort((a, b) => b.relatedCount - a.relatedCount);

  return (
    <div className="space-y-6">
      {/* WORKSTREAM FILTERS */}
      <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 px-2 mb-3">
          Workstream Filters
        </h3>
        {filterTabs.map(tab => {
          const isActive = currentTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                isActive 
                  ? 'bg-slate-900 text-white font-bold shadow-xs' 
                  : 'text-fiverr-dark hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={isActive ? 'text-white' : 'text-slate-400'}>{tab.icon}</span>
                <span>{tab.label}</span>
              </div>
              <span className={`text-xs font-mono font-semibold px-2 py-0.5 rounded-full ${
                isActive 
                  ? 'bg-slate-800 text-slate-200' 
                  : 'bg-slate-100 text-fiverr-muted'
              }`}>
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* PROJECTS SECTION */}
      {projects.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between px-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <FolderKanban className="w-3.5 h-3.5 text-slate-400" />
              <span>Projects</span>
            </h3>
            <span className="text-xs font-bold text-slate-400 font-mono">{projects.length}</span>
          </div>
          <div className="space-y-1 max-h-48 overflow-y-auto text-xs">
            {projectsWithCounts.slice(0, 10).map(p => {
              const isSelected = projectSearch === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => onProjectSelect(isSelected ? '' : p.id)}
                  className={`w-full px-2.5 py-1.5 rounded-lg hover:bg-slate-50 text-fiverr-dark flex items-center justify-between cursor-pointer font-medium border transition-colors ${
                    isSelected 
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-700 font-bold' 
                      : 'border-transparent'
                  }`}
                  title={p.title}
                >
                  <span className="truncate mr-2">• {p.title}</span>
                  {p.relatedCount > 0 && (
                    <span className={`text-xs font-mono font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${
                      isSelected ? 'bg-emerald-200 text-emerald-800' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {p.relatedCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* MY PEOPLE / COLLABORATORS SECTION */}
      <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs space-y-3">
        <div className="flex items-center justify-between px-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-slate-400" />
            <span>My People</span>
          </h3>
          <span className="text-xs font-bold text-emerald-600 font-mono">
            {filteredPeople.length} Contact{filteredPeople.length === 1 ? '' : 's'}
          </span>
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search contacts..."
            value={peopleSearch}
            onChange={(e) => onPeopleSearchChange(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-fiverr-dark placeholder-slate-400 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div className="space-y-2 max-h-64 overflow-y-auto pt-1">
          {filteredPeople.length === 0 ? (
            <div className="text-center py-6 text-slate-400 text-xs">
              No contacts found
            </div>
          ) : (
            filteredPeople.map((person) => {
              const isSelected = selectedPersonFilter === person.id;
              const relatedOrdersCount = orders.filter(
                o => o.sellerId === person.id || o.buyerId === person.id
              ).length;

              return (
              <button
                  key={person.id}
                  onClick={() => onSelectPersonFilter(isSelected ? null : person.id)}
                  className={`w-full flex items-center justify-between p-2 rounded-xl cursor-pointer transition-colors ${
                    isSelected 
                      ? 'bg-emerald-50 border border-emerald-200' 
                      : 'hover:bg-slate-50 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <img
                      src={person.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop'}
                      className="w-7 h-7 rounded-full object-cover ring-1 ring-slate-200 shrink-0"
                      alt={person.name}
                      onError={(e) => { (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=150'; }}
                    />
                    <div className="truncate">
                      <div className="text-xs font-bold text-fiverr-dark truncate">
                        {person.name}
                      </div>
                      <span className="text-xs text-slate-400 font-semibold uppercase tracking-tight block truncate">
                        {person.role || 'Member'}
                      </span>
                    </div>
                  </div>
                  <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded-full shrink-0 ${
                    isSelected ? 'bg-emerald-200 text-emerald-800' : 'bg-slate-100 text-fiverr-dark'
                  }`}>
                    {relatedOrdersCount}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
