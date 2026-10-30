import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  Clock, 
  DollarSign, 
  Globe, 
  ShieldCheck, 
  CheckCircle2, 
  MapPin, 
  Briefcase, 
  MessageSquare, 
  Share2, 
  Heart, 
  FileText, 
  Sparkles, 
  Paperclip, 
  Send, 
  Star, 
  User, 
  AlertCircle, 
  Check, 
  ChevronRight,
  Download,
  Building,
  Calendar,
  Zap,
  HelpCircle,
  TrendingUp,
  RotateCcw
} from 'lucide-react';
import { Project, User as UserType, Proposal, Order, ProjectClarification } from '../../types';
import { calculateOrderFees } from '../../shared/fees';
import { getAuthToken } from '../../utils/authToken';
import { fetchWithRetry } from '../../utils/fetchRetry';
import { DEFAULT_AVATAR } from '../../constants';

interface ProjectDetailViewProps {
  project: Project;
  currentUser: UserType | null;
  navigate: (to: string, e?: React.MouseEvent) => void;
  onSubmitProposal?: (projectId: string, bidAmount: number, deliveryDays: number, coverLetter: string) => void;
  onBookmarkProject?: (projectId: string) => void;
  isBookmarked?: boolean;
  allProjects?: Project[];
  proposals?: Proposal[];
  orders?: Order[];
  onRefresh?: () => Promise<void> | void;
  onContactBuyer?: (buyerId: string, buyerName: string, projectTitle: string, projectId: string) => void;
}

export const ProjectDetailView: React.FC<ProjectDetailViewProps> = ({
  project,
  currentUser,
  navigate,
  onSubmitProposal,
  onBookmarkProject,
  isBookmarked = false,
  allProjects = [],
  proposals = [],
  orders = [],
  onRefresh,
  onContactBuyer
}) => {
  // Local state for proposal submission
  const [proposalBid, setProposalBid] = useState<number | string>(project.budgetMax || project.budgetMin || 1000);
  const [proposalDays, setProposalDays] = useState<number | string>(project.deadlineDays || 7);
  const [proposalDeposit, setProposalDeposit] = useState<number>(20); // 20% deposit default
  const [proposalCover, setProposalCover] = useState<string>('');
  const [isGeneratingAI, setIsGeneratingAI] = useState<boolean>(false);
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);
  const [submittedProposal, setSubmittedProposal] = useState<Proposal | null>(null);
  const [busyProposalId, setBusyProposalId] = useState<string | null>(null);
  const [proposalActionError, setProposalActionError] = useState<string | null>(null);
  const [proposalActionSuccess, setProposalActionSuccess] = useState<{ message: string; workstreamOrderId?: string } | null>(null);
  const [localProjectStatus, setLocalProjectStatus] = useState<Project['status']>(project.status);
  const [isUpdatingProjectStatus, setIsUpdatingProjectStatus] = useState<boolean>(false);

  useEffect(() => {
    setLocalProjectStatus(project.status);
  }, [project.id, project.status]);

  const effectiveStatus = localProjectStatus || project.status;
  const isProjectCompleted = effectiveStatus === 'completed';

  const isProjectOwner = Boolean(currentUser && currentUser.id === project.buyerId);
  const projectProposals = proposals.filter(p => p.projectId === project.id);
  const myProposalsOnProject = currentUser ? projectProposals.filter(p => p.freelancerId === currentUser.id) : [];

  const handleUpdateProjectStatus = async (nextStatus: 'completed' | 'open') => {
    if (isUpdatingProjectStatus) return;
    setIsUpdatingProjectStatus(true);
    setProposalActionError(null);
    setProposalActionSuccess(null);
    try {
      const token = getAuthToken();
      const res = await fetchWithRetry(`/api/projects/${project.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setProposalActionError(data.error || 'Failed to update project status.');
        return;
      }
      setLocalProjectStatus(nextStatus);
      if (onRefresh) await onRefresh();
      if (nextStatus === 'completed') {
        setProposalActionSuccess({
          message: 'Project marked as completed (Bidding Closed). Your project is now hidden from the public project listing page.'
        });
      } else {
        setProposalActionSuccess({
          message: 'Project reopened for bidding and restored to the public project listing page.'
        });
      }
    } catch (err: any) {
      setProposalActionError(err?.message || 'Failed to update project status.');
    } finally {
      setIsUpdatingProjectStatus(false);
    }
  };

  const resolveProposalWorkstreamId = (prop: Proposal): string | undefined => {
    if (prop.workstreamOrderId) return prop.workstreamOrderId;
    return orders.find(o => o.proposalId && o.proposalId === prop.id)?.id;
  };

  const handleProposalDecision = async (prop: Proposal, action: 'accept' | 'decline') => {
    if (busyProposalId) return;

    setBusyProposalId(prop.id);
    setProposalActionError(null);
    setProposalActionSuccess(null);
    try {
      const token = getAuthToken();
      const res = await fetchWithRetry(`/api/proposals/${prop.id}/${action}`, {
        method: 'POST'
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setProposalActionError(data.error || `Failed to ${action} proposal.`);
        setBusyProposalId(null);
        return;
      }
      if (onRefresh) await onRefresh();
      if (action === 'accept') {
        setProposalActionSuccess({
          message: `Hired ${prop.freelancerName} ($${prop.bidAmount.toLocaleString()} USD funded in escrow). Their independent Workstream is now active!`,
          workstreamOrderId: data.workstreamOrderId || data.order?.id
        });
      } else {
        setProposalActionSuccess({
          message: `Declined proposal from ${prop.freelancerName}.`
        });
      }
    } catch (err: any) {
      setProposalActionError(err?.message || `Failed to ${action} proposal.`);
    } finally {
      setBusyProposalId(null);
    }
  };

  // Bookmark & Share state
  const [bookmarked, setBookmarked] = useState<boolean>(isBookmarked);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  // Contact modal state
  const [isContactModalOpen, setIsContactModalOpen] = useState<boolean>(false);
  const [contactMessage, setContactMessage] = useState<string>('');
  const [contactSent, setContactSent] = useState<boolean>(false);

  // Clarification Board state
  const [clarifications, setClarifications] = useState<Array<ProjectClarification>>([]);
  const [newQuestion, setNewQuestion] = useState<string>('');
  const [isSubmittingQuestion, setIsSubmittingQuestion] = useState<boolean>(false);
  const [isAnsweringId, setIsAnsweringId] = useState<string | null>(null);
  const [answerText, setAnswerText] = useState<string>('');

  const fetchClarifications = async () => {
    try {
      const res = await fetch(`/api/projects/${project.id}/clarifications`);
      if (res.ok) {
        const data = await res.json();
        setClarifications(data);
      }
    } catch (err) {
      console.error('Failed to fetch clarifications:', err);
    }
  };

  useEffect(() => {
    fetchClarifications();
  }, [project.id]);

  // Fee preview: same shared math the ledger uses (20% platform commission, freelancer keeps 80%)
  const numericBid = typeof proposalBid === 'number' ? proposalBid : parseFloat(proposalBid) || 0;
  const bidFees = calculateOrderFees(Math.max(0, numericBid));
  const serviceFee = bidFees.platformCommission;
  const netEarnings = bidFees.freelancerNet;
  const depositAmount = Math.round((numericBid * proposalDeposit) / 100);

  // Auto-generate AI Cover Letter
  const handleGenerateAIProposal = () => {
    setIsGeneratingAI(true);
    setTimeout(() => {
      const generated = `Dear ${project.buyerName || 'Client'},\n\nI reviewed your project request for "${project.title}" and I am confident I can deliver exceptional results tailored to your requirements.\n\nWith extensive experience in ${project.skills?.slice(0, 3).join(', ') || 'this field'}, I specialize in providing precise, high-quality work delivered strictly on schedule. I understand the importance of ${project.description.slice(0, 80)}...\n\nWhy choose me:\n• Proven track record with 5-star ratings on similar assignments\n• Clear, regular communication throughout the project lifecycle\n• Thorough review and revisions included until you are 100% satisfied\n\nI am ready to start immediately and can deliver the completed project within ${proposalDays} days. Let us discuss the finer details via chat!\n\nBest regards,\n${currentUser ? currentUser.name : 'Professional Freelancer'}`;
      setProposalCover(generated);
      setIsGeneratingAI(false);
    }, 700);
  };

  // Handle proposal submission
  const handleSubmitProposalForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!proposalCover.trim()) return;

    if (onSubmitProposal) {
      onSubmitProposal(project.id, numericBid, Number(proposalDays), proposalCover);
    }

    const newProp: Proposal = {
      id: `prop_${Date.now()}`,
      projectId: project.id,
      freelancerId: currentUser?.id || 'user_1',
      freelancerName: currentUser?.name || 'You',
      freelancerAvatar: currentUser?.avatar || DEFAULT_AVATAR,
      freelancerTitle: currentUser?.title || 'Senior Freelance Specialist',
      coverLetter: proposalCover,
      bidAmount: numericBid,
      deliveryDays: Number(proposalDays),
      createdAt: 'Just now',
      status: 'pending'
    };

    setSubmittedProposal(newProp);
    setIsSubmitted(true);
  };

  // Handle post clarification question
  const handleAddQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQuestion.trim() || !currentUser) return;
    setIsSubmittingQuestion(true);
    try {
      const token = getAuthToken();
      const res = await fetchWithRetry(`/api/projects/${project.id}/clarifications`, {
        method: 'POST',
        body: JSON.stringify({ text: newQuestion.trim() })
      });
      if (res.ok) {
        setNewQuestion('');
        fetchClarifications();
      }
    } catch (err) {
      console.error('Failed to post question:', err);
    } finally {
      setIsSubmittingQuestion(false);
    }
  };

  const handleAddAnswer = async (replyToId: string) => {
    if (!answerText.trim() || !currentUser) return;
    try {
      const token = getAuthToken();
      const res = await fetchWithRetry(`/api/projects/${project.id}/clarifications`, {
        method: 'POST',
        body: JSON.stringify({ text: answerText.trim(), replyToId })
      });
      if (res.ok) {
        setAnswerText('');
        setIsAnsweringId(null);
        fetchClarifications();
      }
    } catch (err) {
      console.error('Failed to post answer:', err);
    }
  };

  // Bookmark toggle
  const handleToggleBookmark = () => {
    const nextState = !bookmarked;
    setBookmarked(nextState);
    if (onBookmarkProject) {
      onBookmarkProject(project.id);
    }
  };

  // Copy share link
  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  // Contact Buyer submit
  const handleSendContactMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactMessage.trim()) return;
    setContactSent(true);
    setTimeout(() => {
      setIsContactModalOpen(false);
      setContactSent(false);
      setContactMessage('');
      navigate('/messages');
    }, 1200);
  };

  // Similar projects filter (only open/published projects)
  const relatedProjects = allProjects
    .filter(p => p.id !== project.id && (p.status === 'open' || p.status === 'published') && (p.category === project.category || p.skills?.some(s => project.skills?.includes(s))))
    .slice(0, 3);

  return (
    <div className="bg-slate-50 min-h-screen pb-16 font-sans text-slate-800">
      
      {/* BREADCRUMB & HEADER CONTAINER */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          
          {/* Breadcrumbs */}
          <nav className="flex items-center gap-2 text-xs text-slate-500 mb-4 overflow-x-auto whitespace-nowrap pb-1">
            <a href="/" onClick={(e) => navigate('/', e)} className="hover:text-emerald-600 transition-colors">Home</a>
            <ChevronRight className="w-3 h-3 text-slate-400 shrink-0" />
            <a href="/projects" onClick={(e) => navigate('/projects', e)} className="hover:text-emerald-600 transition-colors">Freelance Jobs</a>
            {project.category && (
              <>
                <ChevronRight className="w-3 h-3 text-slate-400 shrink-0" />
                <a href={`/projects?category=${encodeURIComponent(project.category)}`} onClick={(e) => navigate(`/projects?category=${encodeURIComponent(project.category!)}`, e)} className="hover:text-emerald-600 transition-colors">
                  {project.category}
                </a>
              </>
            )}
            {project.subcategory && (
              <>
                <ChevronRight className="w-3 h-3 text-slate-400 shrink-0" />
                <span className="text-slate-700 font-medium">{project.subcategory}</span>
              </>
            )}
          </nav>

          {/* Job Title & Badges Header */}
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div className="space-y-3 max-w-4xl">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`px-2.5 py-0.5 text-xs font-bold rounded-md ${
                  project.projectType === 'hourly' 
                    ? 'bg-purple-100 text-purple-700 border border-purple-200' 
                    : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                }`}>
                  {project.projectType === 'hourly' ? 'Hourly Rate' : 'Fixed Price'}
                </span>
                {isProjectCompleted ? (
                  <span className="px-2.5 py-0.5 text-xs font-bold rounded-md bg-slate-900 text-white border border-slate-800 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Completed · Bidding Closed
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 text-xs font-bold rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Open for Proposals
                  </span>
                )}
                {project.isUrgent && !isProjectCompleted && (
                  <span className="px-2.5 py-0.5 text-xs font-bold rounded-md bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1">
                    <Zap className="w-3 h-3 fill-amber-500 text-amber-500" /> Urgent Job
                  </span>
                )}
                {project.featured && (
                  <span className="px-2.5 py-0.5 text-xs font-bold rounded-md bg-sky-100 text-sky-800 border border-sky-200">
                    Featured
                  </span>
                )}
                <span className="text-xs text-slate-400">
                  Ref #{project.id.replace('proj_', '4526')}
                </span>
              </div>

              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight leading-snug">
                {project.title}
              </h1>

              {/* Sub-header meta line */}
              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 pt-1">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span>Posted {project.createdAt}</span>
                </span>
                <span className="hidden sm:inline text-slate-300">•</span>
                <span className="flex items-center gap-1.5">
                  <Briefcase className="w-3.5 h-3.5 text-slate-400" />
                  <span>{project.proposalsCount || 0} Proposals received</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-slate-400" />
                  <span>{project.location || 'Remote / Worldwide'}</span>
                </span>
                <span className="hidden sm:inline text-slate-300">•</span>
                <span className="flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-slate-400" />
                  {project.hireRate !== null && project.hireRate !== undefined ? (
                    <span className="text-emerald-600 font-bold">{Math.round(project.hireRate * 100)}% Hire Rate</span>
                  ) : (
                    <span className="text-slate-500">Not enough history</span>
                  )}
                </span>
              </div>
            </div>

            {/* Quick Action Top Bar (Bookmark, Share & Owner/Freelancer CTA) */}
            <div className="flex flex-wrap items-center gap-2 shrink-0 pt-2 lg:pt-0">
              <button
                type="button"
                onClick={handleToggleBookmark}
                className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                  bookmarked 
                    ? 'bg-rose-50 border-rose-200 text-rose-600 hover:bg-rose-100' 
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
                title={bookmarked ? 'Saved to bookmarks' : 'Save job'}
              >
                <Heart className={`w-4 h-4 ${bookmarked ? 'fill-rose-500 text-rose-500' : ''}`} />
                <span className="hidden sm:inline">{bookmarked ? 'Saved' : 'Save'}</span>
              </button>

              <button
                type="button"
                onClick={handleCopyLink}
                className="p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Share2 className="w-4 h-4 text-slate-500" />
                <span className="hidden sm:inline">{copiedLink ? 'Link Copied!' : 'Share'}</span>
              </button>

              {isProjectOwner ? null : isProjectCompleted ? (
                <span className="px-4 py-2.5 bg-slate-100 text-slate-600 border border-slate-200 font-bold text-xs rounded-xl flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-slate-500" />
                  <span>Bidding Closed</span>
                </span>
              ) : (
                <a
                  href="#submit-proposal-section"
                  className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5"
                >
                  <span>Send Proposal</span>
                </a>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* MAIN TWO-COLUMN BODY */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* LEFT MAIN COLUMN (8 COLS) */}
          <div className="lg:col-span-8 space-y-8">
            
            {/* 1. PROJECT SPECIFICATIONS & DESCRIPTION CARD */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-xs space-y-6">
              
              {/* Key Highlights Spec Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-100">
                <div>
                  <span className="text-xs text-slate-400 font-medium block mb-1">Budget</span>
                  <span className="text-lg font-black text-slate-900 flex items-center">
                    ${project.budgetMax ? project.budgetMax.toLocaleString() : project.budgetMin?.toLocaleString()}
                    <span className="text-xs font-normal text-slate-500 ml-1">
                      {project.projectType === 'hourly' ? '/hr' : 'Fixed'}
                    </span>
                  </span>
                </div>

                <div>
                  <span className="text-xs text-slate-400 font-medium block mb-1">Experience Needed</span>
                  <span className="text-sm font-bold text-slate-800 capitalize">
                    {project.experienceLevel || 'Expert'}
                  </span>
                </div>

                <div>
                  <span className="text-xs text-slate-400 font-medium block mb-1">Est. Duration</span>
                  <span className="text-sm font-bold text-slate-800">
                    {project.deadlineDays ? `${project.deadlineDays} Days` : '1 - 2 weeks'}
                  </span>
                </div>

                <div>
                  <span className="text-xs text-slate-400 font-medium block mb-1">Location</span>
                  <span className="text-sm font-bold text-slate-800 truncate block">
                    {project.location || 'Worldwide'}
                  </span>
                </div>
              </div>

              {/* Description Section */}
              <div>
                <h2 className="text-lg font-bold text-slate-900 mb-4 pb-2 border-b border-slate-100">
                  Job Description & Scope of Work
                </h2>
                
                <div className="prose prose-slate max-w-none text-sm leading-relaxed text-slate-700 whitespace-pre-line space-y-3">
                  {project.description}
                  
                  {/* Supplementary default context to ensure complete, rich description layout */}
                  {!project.description.includes('Key Deliverables') && (
                    <div className="pt-4 space-y-3 text-slate-700">
                      <h3 className="text-sm font-bold text-slate-900">Key Deliverables & Responsibilities:</h3>
                      <ul className="list-disc pl-5 space-y-1 text-slate-600">
                        <li>Thorough review and auditing of existing documentation and specifications.</li>
                        <li>Identify key risks, compliance gaps, and actionable recommendations.</li>
                        <li>Provide structured feedback and clear documentation upon completion.</li>
                        <li>Participate in a 30-minute clarification call if required by the buyer.</li>
                      </ul>
                      <p className="text-slate-600 pt-1">
                        Please submit your proposed timeline, detailed methodology, and relevant work samples with your proposal.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Skills Required */}
              {project.skills && project.skills.length > 0 && (
                <div className="pt-4 border-t border-slate-100">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                    Skills & Expertise Required
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {project.skills.map((skill, index) => (
                      <a
                        key={index}
                        href={`/projects?search=${encodeURIComponent(skill)}`}
                        onClick={(e) => navigate(`/projects?search=${encodeURIComponent(skill)}`, e)}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 text-slate-700 rounded-lg text-xs font-medium transition-colors border border-slate-200"
                      >
                        {skill}
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Attachments Section if present */}
              {project.attachments && project.attachments.length > 0 && (
                <div className="pt-4 border-t border-slate-100">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                    Project Attachments ({project.attachments.length})
                  </h3>
                  <div className="space-y-2">
                    {project.attachments.map((att, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <FileText className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span className="font-semibold text-slate-800 truncate">{att.name}</span>
                          <span className="text-slate-400 text-2xs">({att.size})</span>
                        </div>
                        <button 
                          type="button" 
                          onClick={() => alert(`Downloading ${att.name}...`)}
                          className="flex items-center gap-1 text-emerald-600 hover:text-emerald-700 font-bold shrink-0 ml-2 cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" /> Download
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>


            {/* 2. CLARIFICATION BOARD (Q&A SECTION) */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-xs space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                    <HelpCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">Clarification Board</h2>
                    <p className="text-xs text-slate-500">Public Q&A between freelancers and the buyer before submitting proposals.</p>
                  </div>
                </div>
                <span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-full text-xs font-bold">
                  {clarifications.length} Questions
                </span>
              </div>

              {/* Ask Question Input */}
              <form onSubmit={handleAddQuestion} className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Ask the Buyer a Clarification Question
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newQuestion}
                    onChange={(e) => setNewQuestion(e.target.value)}
                    placeholder="e.g. Is there a preferred deadline for the initial draft?"
                    className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white"
                  />
                  <button
                    type="submit"
                    disabled={isSubmittingQuestion || !newQuestion.trim()}
                    className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Post</span>
                  </button>
                </div>
                <p className="text-2xs text-slate-400">Questions are public and visible to all freelancers proposing on this job.</p>
              </form>

              {/* List of Questions & Answers */}
              <div className="space-y-4 pt-2">
                {clarifications.length === 0 ? (
                  <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-100 text-xs text-slate-400 italic">
                    No clarification questions yet. Freelancers can ask questions to clear doubts before bidding.
                  </div>
                ) : (
                  clarifications.map((item) => (
                    <div key={item.id} className="p-4 rounded-xl border border-slate-100 bg-white space-y-3 shadow-2xs">
                      {/* Question */}
                      <div className="flex items-start gap-3">
                        <img 
                          src={item.userAvatar || DEFAULT_AVATAR} 
                          alt={item.userName} 
                          className="w-8 h-8 rounded-full object-cover shrink-0 mt-0.5 border border-slate-200"
                          onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_AVATAR; }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-bold text-slate-900">{item.userName}</span>
                            <span className="text-2xs text-slate-400">{new Date(item.timestamp).toLocaleString()}</span>
                          </div>
                          <p className="text-xs text-slate-700 leading-relaxed font-medium">
                            "{item.text}"
                          </p>
                        </div>
                      </div>

                      {/* Replies */}
                      <div className="ml-11 space-y-3">
                        {item.replies?.map((rep) => (
                          <div key={rep.id} className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-100/80 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-2xs font-extrabold text-emerald-800 uppercase tracking-wider flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Response ({rep.userName})
                              </span>
                              <span className="text-2xs text-slate-400">{new Date(rep.timestamp).toLocaleString()}</span>
                            </div>
                            <p className="text-xs text-emerald-950 leading-relaxed">
                              {rep.text}
                            </p>
                          </div>
                        ))}

                        {/* project owner can reply if they haven't or even if they have */}
                        {isProjectOwner && (
                          <div>
                            {isAnsweringId === item.id ? (
                              <div className="space-y-2 animate-in fade-in slide-in-from-left-1">
                                <textarea
                                  value={answerText}
                                  onChange={(e) => setAnswerText(e.target.value)}
                                  placeholder="Type your response to this clarification..."
                                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                                  rows={2}
                                />
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => handleAddAnswer(item.id)}
                                    disabled={!answerText.trim()}
                                    className="px-3 py-1.5 bg-emerald-600 text-white font-bold rounded-lg text-[10px] cursor-pointer"
                                  >
                                    Post Answer
                                  </button>
                                  <button
                                    onClick={() => { setIsAnsweringId(null); setAnswerText(''); }}
                                    className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 font-bold rounded-lg text-[10px] cursor-pointer"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                onClick={() => setIsAnsweringId(item.id)}
                                className="text-[10px] font-bold text-emerald-600 hover:underline flex items-center gap-1 transition cursor-pointer"
                              >
                                <MessageSquare className="w-3 h-3" />
                                <span>{item.replies?.length ? 'Add another response' : 'Respond to this question'}</span>
                              </button>
                            )}
                          </div>
                        )}

                        {!isProjectOwner && (!item.replies || item.replies.length === 0) && (
                          <div className="text-2xs text-slate-400 italic">
                            Pending answer from buyer...
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>


            {/* 3. BUYER MULTI-PROPOSAL & MULTI-FREELANCER WORKSTREAMS PANEL */}
            {isProjectOwner && (
              <div id="buyer-proposals-section" className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-xs space-y-6">
                <div className="pb-5 border-b border-slate-100 flex flex-col gap-4">
                  <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                    <div className="space-y-1 max-w-2xl">
                      <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
                        Freelancer Proposals & Independent Workstreams ({projectProposals.length})
                      </h2>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        You can accept multiple proposals to hire multiple freelancers for this project. Every accepted freelancer receives their own independent USD escrow Workstream.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <span className="px-3 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-full text-xs font-bold">
                        {projectProposals.filter(p => p.status === 'accepted').length} Hired
                      </span>
                      <span className="px-3 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-full text-xs font-bold">
                        {projectProposals.filter(p => p.status === 'pending').length} Pending
                      </span>
                    </div>
                  </div>

                  <div className="pt-1">
                    <div className="text-xs text-slate-500 font-medium">
                      Manage hiring decisions, review candidate proposals, and track escrow Workstreams below.
                    </div>
                  </div>
                </div>

                {isProjectCompleted && (
                  <div className="p-4 bg-slate-900 text-white rounded-xl text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <div>
                        <span className="font-bold block">Project Completed · Bidding Closed</span>
                        <span className="text-slate-300 text-[11px]">
                          This project is hidden from the public project listing page and closed to new proposals. Your active Workstreams continue normally.
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {proposalActionError && (
                  <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 font-medium flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                    <div className="flex items-start gap-2.5">
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      <span className="leading-relaxed">{proposalActionError}</span>
                    </div>
                    {proposalActionError.toLowerCase().includes('wallet') && (
                      <button
                        type="button"
                        onClick={() => navigate('/wallet')}
                        className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition shrink-0 cursor-pointer shadow-xs flex items-center gap-1.5"
                      >
                        <span>Add Funds to Wallet</span>
                        <span>→</span>
                      </button>
                    )}
                  </div>
                )}

                {proposalActionSuccess && (
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2 font-bold">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>{proposalActionSuccess.message}</span>
                    </div>
                    {proposalActionSuccess.workstreamOrderId && (
                      <button
                        type="button"
                        onClick={(e) => navigate(`/messages/${proposalActionSuccess.workstreamOrderId}`, e)}
                        className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs shrink-0 cursor-pointer"
                      >
                        Open Workstream →
                      </button>
                    )}
                  </div>
                )}

                {projectProposals.length === 0 ? (
                  <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-100 text-xs text-slate-500">
                    No proposals have been submitted for this project yet.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {projectProposals.map((prop) => {
                      const wsOrderId = resolveProposalWorkstreamId(prop);
                      const wsOrder = wsOrderId ? orders.find(o => o.id === wsOrderId) : undefined;
                      const isBusy = busyProposalId === prop.id;
                      return (
                        <div
                          key={prop.id}
                          className={`p-5 rounded-2xl border transition-all space-y-4 ${
                            prop.status === 'accepted'
                              ? 'bg-emerald-50/40 border-emerald-200'
                              : prop.status === 'rejected'
                                ? 'bg-slate-50 border-slate-200 opacity-75'
                                : 'bg-white border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                              <img
                                src={prop.freelancerAvatar || DEFAULT_AVATAR}
                                alt={prop.freelancerName}
                                className="w-11 h-11 rounded-full object-cover border border-slate-200 shrink-0"
                                onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_AVATAR; }}
                              />
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-bold text-slate-900">{prop.freelancerName}</span>
                                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                                    prop.status === 'accepted'
                                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                      : prop.status === 'rejected'
                                        ? 'bg-rose-50 text-rose-700 border-rose-200'
                                        : 'bg-amber-50 text-amber-800 border-amber-200'
                                  }`}>
                                    {prop.status === 'accepted' ? 'Accepted · Hired' : prop.status}
                                  </span>
                                  {wsOrderId && (
                                    <span className="text-[11px] font-mono text-slate-500">
                                      Workstream #{wsOrderId} {wsOrder ? `(${wsOrder.status.replace(/_/g, ' ')})` : ''}
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-slate-500">{prop.freelancerTitle || 'Freelance Specialist'} • Submitted {prop.createdAt}</p>
                              </div>
                            </div>

                            <div className="text-left sm:text-right shrink-0">
                              <div className="text-xl font-black text-slate-900 font-mono">
                                ${Number(prop.bidAmount).toLocaleString()} <span className="text-xs font-bold text-slate-500">USD</span>
                              </div>
                              <div className="text-xs text-slate-500">
                                Delivery in <strong>{prop.deliveryDays}</strong> day{prop.deliveryDays === 1 ? '' : 's'}
                              </div>
                            </div>
                          </div>

                          <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-line bg-white/80 p-3.5 rounded-xl border border-slate-100">
                            {prop.coverLetter}
                          </p>

                          <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1">
                            {wsOrderId && (
                              <button
                                type="button"
                                onClick={(e) => navigate(`/messages/${wsOrderId}`, e)}
                                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer"
                              >
                                <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                                <span>{prop.status === 'accepted' ? 'Open Independent Workstream' : 'Message in Workstream'}</span>
                              </button>
                            )}
                            {prop.status === 'pending' && (
                              <>
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => handleProposalDecision(prop, 'accept')}
                                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                                >
                                  <ShieldCheck className="w-3.5 h-3.5" />
                                  <span>{isBusy ? 'Processing...' : `Accept & Hire ($${Number(prop.bidAmount).toLocaleString()} USD)`}</span>
                                </button>
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => handleProposalDecision(prop, 'decline')}
                                  className="px-3.5 py-2 border border-slate-200 hover:bg-slate-100 disabled:opacity-50 text-slate-600 font-bold rounded-xl text-xs transition cursor-pointer"
                                >
                                  Decline
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* FREELANCER'S EXISTING PROPOSALS ON THIS PROJECT */}
            {!isProjectOwner && myProposalsOnProject.length > 0 && (
              <div className="bg-white border border-emerald-200 rounded-2xl p-6 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    <span>Your Submitted Proposal{myProposalsOnProject.length > 1 ? 's' : ''} ({myProposalsOnProject.length})</span>
                  </h3>
                </div>
                <div className="space-y-3">
                  {myProposalsOnProject.map(myProp => {
                    const wsId = resolveProposalWorkstreamId(myProp);
                    return (
                      <div key={myProp.id} className="p-4 bg-emerald-50/50 border border-emerald-200/80 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-black text-slate-900 font-mono">${Number(myProp.bidAmount).toLocaleString()} USD</span>
                            <span className="text-xs text-slate-500">• {myProp.deliveryDays} days delivery</span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              myProp.status === 'accepted' ? 'bg-emerald-600 text-white' :
                              myProp.status === 'rejected' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                            }`}>
                              {myProp.status}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 line-clamp-2">{myProp.coverLetter}</p>
                        </div>
                        {wsId && (
                          <button
                            type="button"
                            onClick={(e) => navigate(`/messages/${wsId}`, e)}
                            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs shrink-0 cursor-pointer flex items-center gap-1.5"
                          >
                            <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Open Workstream</span>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 4. PROPOSAL SUBMISSION SECTION */}
            {!isProjectOwner && (
            <div id="submit-proposal-section" className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-xs space-y-6">
              
              <div className="pb-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-extrabold text-slate-900">
                    {isProjectCompleted ? 'Project Completed — Bidding Closed' : 'Send Your Proposal'}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {isProjectCompleted
                      ? 'The buyer has finished hiring for this project and closed bidding.'
                      : 'Submit your pitch, delivery timeframe, and deposit requirements directly to the buyer.'}
                  </p>
                </div>
                {isSubmitted && (
                  <span className="px-3 py-1 bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-full text-xs font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Proposal Submitted
                  </span>
                )}
              </div>

              {isProjectCompleted ? (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 text-center space-y-3">
                  <CheckCircle2 className="w-10 h-10 text-slate-400 mx-auto" />
                  <h3 className="text-base font-extrabold text-slate-900">This Project Listing is Closed</h3>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    {project.buyerName} has marked this project as completed and is no longer accepting new proposals.
                  </p>
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={(e) => navigate('/projects', e)}
                      className="px-5 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                      Browse Open Projects
                    </button>
                  </div>
                </div>
              ) : isSubmitted ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center space-y-4">
                  <div className="w-12 h-12 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center mx-auto shadow-sm">
                    <Check className="w-6 h-6 stroke-[3]" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-lg font-extrabold text-emerald-950">Proposal Successfully Submitted!</h3>
                    <p className="text-xs text-emerald-800 max-w-md mx-auto">
                      Your proposal for <span className="font-bold text-emerald-950">${submittedProposal?.bidAmount}</span> ({submittedProposal?.deliveryDays} days delivery) has been sent to {project.buyerName}.
                    </p>
                  </div>

                  <div className="pt-2 flex justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => setIsSubmitted(false)}
                      className="px-4 py-2 bg-white border border-emerald-300 text-emerald-900 rounded-xl text-xs font-bold hover:bg-emerald-100 transition-colors cursor-pointer"
                    >
                      Edit Proposal
                    </button>
                    <button
                      type="button"
                      onClick={(e) => navigate('/projects', e)}
                      className="px-5 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                      Back to Buyer Requests
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmitProposalForm} className="space-y-6">
                  
                  {/* Financial inputs grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    
                    {/* Your Bid */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                        Your Bid Amount ($)
                      </label>
                      <div className="relative">
                        <span className="absolute left-3.5 top-3 text-slate-400 font-bold text-sm">$</span>
                        <input
                          type="number"
                          min="5"
                          step="5"
                          value={proposalBid}
                          onChange={(e) => setProposalBid(e.target.value)}
                          required
                          className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-slate-300 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                        />
                      </div>
                      <span className="text-2xs text-slate-400 mt-1 block">Buyer Budget: ${project.budgetMax || project.budgetMin}</span>
                    </div>

                    {/* Delivery Days */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                        Delivery Time (Days)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="180"
                        value={proposalDays}
                        onChange={(e) => setProposalDays(e.target.value)}
                        required
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      />
                      <span className="text-2xs text-slate-400 mt-1 block">Requested: {project.deadlineDays || 7} Days</span>
                    </div>

                    {/* Deposit % */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                        Required Deposit
                      </label>
                      <select
                        value={proposalDeposit}
                        onChange={(e) => setProposalDeposit(Number(e.target.value))}
                        className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white"
                      >
                        <option value={0}>No Deposit (0%)</option>
                        <option value={20}>Standard (20% - ${Math.round(numericBid * 0.2)})</option>
                        <option value={50}>50% Deposit (${Math.round(numericBid * 0.5)})</option>
                        <option value={100}>100% Upfront (${numericBid})</option>
                      </select>
                      <span className="text-2xs text-slate-400 mt-1 block">Escrow deposit before work begins</span>
                    </div>

                  </div>

                  {/* Fee Breakdown Summary Box */}
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2">
                    <div className="flex justify-between text-slate-600">
                      <span>Your Proposed Bid:</span>
                      <span className="font-semibold text-slate-900">${numericBid.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Platform Commission ({100 - bidFees.freelancerPercent}%):</span>
                      <span className="text-rose-600">-${serviceFee.toLocaleString()}</span>
                    </div>
                    <div className="pt-2 border-t border-slate-200 flex justify-between font-extrabold text-sm text-slate-900">
                      <span>You Will Receive:</span>
                      <span className="text-emerald-600">${netEarnings.toLocaleString()}</span>
                    </div>
                  </div>

                  {/* Cover Letter Pitch */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                        Proposal Pitch / Cover Letter
                      </label>
                      <button
                        type="button"
                        onClick={handleGenerateAIProposal}
                        disabled={isGeneratingAI}
                        className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg text-xs font-bold transition-colors border border-emerald-200 cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                        <span>{isGeneratingAI ? 'Generating...' : 'Auto-Generate Cover Letter'}</span>
                      </button>
                    </div>

                    <textarea
                      rows={7}
                      value={proposalCover}
                      onChange={(e) => setProposalCover(e.target.value)}
                      placeholder="Explain why you are the best person for this project. Highlight relevant past experience, methodology, and questions..."
                      required
                      className="w-full p-4 rounded-xl border border-slate-300 text-xs sm:text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none leading-relaxed font-sans"
                    />
                  </div>

                  {/* Attachment Dropzone */}
                  <div className="p-4 border-2 border-dashed border-slate-200 rounded-xl text-center space-y-1 hover:border-emerald-400 transition-colors cursor-pointer bg-slate-50/50">
                    <Paperclip className="w-5 h-5 text-slate-400 mx-auto" />
                    <p className="text-xs font-bold text-slate-700">Attach Portfolio Work / Proposals (Optional)</p>
                    <p className="text-2xs text-slate-400">Drag & drop files here, or click to browse (PDF, DOCX, PNG up to 25MB)</p>
                  </div>

                  {/* Submit CTA */}
                  <button
                    type="submit"
                    className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-extrabold rounded-xl shadow-md transition-all text-sm uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Send className="w-4 h-4" />
                    <span>Send Proposal to {project.buyerName}</span>
                  </button>

                  <p className="text-2xs text-center text-slate-400">
                    By submitting this proposal, you agree to WorkPerHour terms of service and client confidentiality rules.
                  </p>

                </form>
              )}

            </div>
            )}

          </div>


          {/* RIGHT SIDEBAR COLUMN (4 COLS) */}
          <div className="lg:col-span-4 space-y-6">
            
            {/* 1. ABOUT THE BUYER CARD */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-5">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-3">
                About the Client / Buyer
              </h3>

              <div className="flex items-center gap-3.5">
                <div className="relative">
                  <img
                    src={project.buyerAvatar || DEFAULT_AVATAR}
                    alt={project.buyerName}
                    className="w-14 h-14 rounded-full object-cover border-2 border-slate-100 shadow-xs"
                    onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_AVATAR; }}
                  />
                  <span className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 text-xs shadow-xs" title="Country Flag">
                    {project.countryFlag || '🇬🇧'}
                  </span>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <h4 className="text-base font-bold text-slate-900 truncate">{project.buyerName}</h4>
                    {project.verifiedBuyer !== false && (
                      <span title="Verified Buyer">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 fill-emerald-100 shrink-0" />
                      </span>
                    )}
                  </div>
                  
                  {/* Rating */}
                  <div className="flex items-center gap-1.5 text-xs text-slate-600 mt-0.5">
                    <div className="flex items-center text-amber-400">
                      <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                    </div>
                    <span className="font-bold text-slate-900">{project.buyerRating ? project.buyerRating.toFixed(1) : 'No reviews yet'}</span>
                    {project.buyerReviewsCount ? <span className="text-slate-400">({project.buyerReviewsCount} reviews)</span> : null}
                  </div>
                </div>
              </div>

              {/* Buyer Metadata List */}
              <div className="space-y-3 pt-2 text-xs text-slate-600 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" /> Location
                  </span>
                  <span className="font-semibold text-slate-900">{project.location || 'Not specified'}</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-500 flex items-center gap-1.5">
                    <Briefcase className="w-3.5 h-3.5 text-slate-400" /> Projects Posted
                  </span>
                  <span className="font-semibold text-slate-900">{project.buyerProjectsPosted !== undefined ? `${project.buyerProjectsPosted} projects` : 'No projects yet'}</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-500 flex items-center gap-1.5">
                    <DollarSign className="w-3.5 h-3.5 text-slate-400" /> Total Spend
                  </span>
                  <span className="font-bold text-emerald-600">{project.buyerSpent !== undefined ? `$${project.buyerSpent.toLocaleString()}` : 'Not available'}</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-500 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" /> Member Since
                  </span>
                  <span className="font-semibold text-slate-900">{project.buyerMemberSince || 'New buyer'}</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-500 flex items-center gap-1.5">
                    <RotateCcw className="w-3.5 h-3.5 text-slate-400" /> Hire Rate
                  </span>
                  <span className="font-semibold text-slate-900">
                    {project.hireRate !== null && project.hireRate !== undefined ? `${Math.round(project.hireRate * 100)}%` : 'Not enough history'}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-500 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Payment Verification
                  </span>
                  <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 font-bold rounded-md text-2xs border border-emerald-200">
                    Verified
                  </span>
                </div>
              </div>

              {/* Contact Buyer Button */}
              {!isProjectOwner && (
                <button
                  type="button"
                  onClick={() => {
                    if (onContactBuyer) {
                      onContactBuyer(project.buyerId, project.buyerName, project.title, project.id);
                    } else {
                      setIsContactModalOpen(true);
                    }
                  }}
                  className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-900 font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer border border-slate-200"
                >
                  <MessageSquare className="w-4 h-4 text-slate-600" />
                  <span>Contact Buyer</span>
                </button>
              )}

            </div>


            {/* 2. JOB SUMMARY & QUICK METRICS BOX */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-3">
                Job Overview
              </h3>

              <div className="space-y-3 text-xs">
                <div className="flex justify-between items-center pb-2 border-b border-slate-50">
                  <span className="text-slate-500">Project Budget:</span>
                  <span className="text-base font-black text-slate-900">${project.budgetMax || project.budgetMin}</span>
                </div>

                <div className="flex justify-between items-center pb-2 border-b border-slate-50">
                  <span className="text-slate-500">Listing Status:</span>
                  <span className={`font-bold ${isProjectCompleted ? 'text-slate-700' : 'text-emerald-600'}`}>
                    {isProjectCompleted ? 'Completed (Closed)' : 'Open for Bidding'}
                  </span>
                </div>

                <div className="flex justify-between items-center pb-2 border-b border-slate-50">
                  <span className="text-slate-500">Proposals Count:</span>
                  <span className="font-bold text-slate-900">{project.proposalsCount || 0} Submitted</span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Average Bid:</span>
                  <span className="font-bold text-slate-900">${Math.round((project.budgetMax || 1000) * 0.95)}</span>
                </div>
              </div>

              <div className="pt-2">
                {isProjectOwner ? (
                  isProjectCompleted ? (
                    <button
                      type="button"
                      disabled={isUpdatingProjectStatus}
                      onClick={() => handleUpdateProjectStatus('open')}
                      className="w-full py-3 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-800 border border-slate-300 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>{isUpdatingProjectStatus ? 'Updating...' : 'Reopen Project Bidding'}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={isUpdatingProjectStatus}
                      onClick={() => handleUpdateProjectStatus('completed')}
                      className="w-full py-3 bg-slate-900 hover:bg-emerald-600 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>{isUpdatingProjectStatus ? 'Closing...' : 'Mark Project as Completed (Close Bidding)'}</span>
                    </button>
                  )
                ) : !isProjectCompleted ? (
                  <a
                    href="#submit-proposal-section"
                    className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5"
                  >
                    <span>Submit Proposal</span>
                  </a>
                ) : null}
              </div>
            </div>


            {/* 3. SIMILAR FREELANCE JOBS */}
            {relatedProjects.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-3">
                  Similar Freelance Jobs
                </h3>

                <div className="space-y-3">
                  {relatedProjects.map((rel) => (
                    <a
                      key={rel.id}
                      href={`/projects/${rel.id}`}
                      onClick={(e) => navigate(`/projects/${rel.id}`, e)}
                      className="block p-3 rounded-xl border border-slate-100 hover:border-slate-300 hover:bg-slate-50 transition-all group"
                    >
                      <h4 className="text-xs font-bold text-slate-800 group-hover:text-emerald-600 line-clamp-2 leading-snug mb-1.5">
                        {rel.title}
                      </h4>
                      <div className="flex items-center justify-between text-2xs text-slate-500">
                        <span className="font-extrabold text-slate-900">${rel.budgetMax || rel.budgetMin}</span>
                        <span>{rel.createdAt}</span>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}

          </div>

        </div>
      </div>


      {/* CONTACT BUYER MODAL */}
      {isContactModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl space-y-6 relative border border-slate-200">
            <button
              type="button"
              onClick={() => setIsContactModalOpen(false)}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 p-1 font-bold text-lg cursor-pointer"
            >
              ✕
            </button>

            <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
              <img
                src={project.buyerAvatar || DEFAULT_AVATAR}
                alt={project.buyerName}
                className="w-12 h-12 rounded-full object-cover border border-slate-200"
                onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_AVATAR; }}
              />
              <div>
                <h3 className="text-base font-bold text-slate-900">Send Message to {project.buyerName}</h3>
                <p className="text-xs text-slate-500">Inquiry regarding "{project.title}"</p>
              </div>
            </div>

            {contactSent ? (
              <div className="py-8 text-center space-y-2">
                <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
                <p className="text-sm font-bold text-slate-900">Message Delivered!</p>
                <p className="text-xs text-slate-500">Redirecting to Workstream chat...</p>
              </div>
            ) : (
              <form onSubmit={handleSendContactMessage} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                    Your Message
                  </label>
                  <textarea
                    rows={5}
                    value={contactMessage}
                    onChange={(e) => setContactMessage(e.target.value)}
                    placeholder="Ask questions about job scope, timeline or request clarification before submitting your proposal..."
                    required
                    className="w-full p-3.5 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsContactModalOpen(false)}
                    className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:text-slate-900 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Send Direct Message</span>
                  </button>
                </div>
              </form>
            )}

          </div>
        </div>
      )}

    </div>
  );
};
