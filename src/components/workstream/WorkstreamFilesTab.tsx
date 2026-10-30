import React, { useRef } from 'react';
import { FileText, Download, PlusCircle, FileCode, Image, FileArchive, ArrowUpRight, FolderOpen } from 'lucide-react';
import { SharedFileItem } from './types';
import { uploadWorkstreamFile } from '../../utils/workstreamUpload';
import { classifyFileUrl, openWebLink } from '../../utils/safeFileLink';

interface WorkstreamFilesTabProps {
  files: SharedFileItem[];
  orderId?: string;
  workspaceId?: string;
  onUploadFile: (file: { name: string; size: string; url: string }) => void;
  onDownloadFile?: (file: SharedFileItem) => void;
}

export const WorkstreamFilesTab: React.FC<WorkstreamFilesTabProps> = ({
  files,
  orderId,
  workspaceId,
  onUploadFile,
  onDownloadFile
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const result = await uploadWorkstreamFile(file, { orderId, workspaceId });
      onUploadFile(result);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const getFileIcon = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase();
    if (['jpg', 'jpeg', 'png', 'svg', 'gif', 'webp'].includes(ext || '')) {
      return <Image className="w-5 h-5 text-indigo-500" />;
    }
    if (['ts', 'tsx', 'js', 'jsx', 'html', 'css', 'json', 'py', 'java'].includes(ext || '')) {
      return <FileCode className="w-5 h-5 text-emerald-500" />;
    }
    if (['zip', 'rar', 'tar', 'gz', '7z'].includes(ext || '')) {
      return <FileArchive className="w-5 h-5 text-amber-500" />;
    }
    return <FileText className="w-5 h-5 text-slate-500" />;
  };

  const handleDownload = (file: SharedFileItem) => {
    if (onDownloadFile) {
      onDownloadFile(file);
      return;
    }
    if (!file.url || file.url === '#') return;
    const link0 = classifyFileUrl(file.url);
    if (link0.kind === 'web') { openWebLink(link0.url); return; }
    if (link0.kind === 'text') { alert(`${file.name || 'Deliverable'}:\n\n${link0.url}`); return; }
    const downloadUrl = file.url.includes('?') ? `${file.url}&download=1` : `${file.url}?download=1`;
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = file.name || 'download';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full bg-slate-50/30">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-fiverr-dark uppercase tracking-tight">
            Shared Project Assets & Files
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Deliverables, code archives, designs, and specifications shared in this workstream.
          </p>
        </div>

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl flex items-center gap-2 shadow-xs transition cursor-pointer"
        >
          <PlusCircle className="w-4 h-4" />
          <span>Upload File</span>
        </button>
      </div>

      {files.length === 0 ? (
        <div className="py-20 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-3">
          <div className="p-4 bg-white border border-slate-200 rounded-full shadow-2xs">
            <FolderOpen className="w-10 h-10 opacity-30 text-slate-500" />
          </div>
          <div>
            <p className="font-bold text-fiverr-dark text-sm">No files uploaded yet</p>
            <p className="text-slate-400 mt-1 max-w-sm">
              Any deliverables, briefs, and attachments shared in this workstream will automatically be organized here.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {files.map((file) => (
            <div
              key={file.id}
              className="p-4 bg-white border border-slate-200 rounded-2xl flex items-center gap-4 hover:border-emerald-300 hover:shadow-xs transition group cursor-pointer"
              onClick={() => handleDownload(file)}
            >
              <div className="p-3 bg-slate-50 rounded-xl group-hover:bg-emerald-50 transition shrink-0">
                {getFileIcon(file.name)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="font-bold text-xs text-fiverr-dark truncate group-hover:text-emerald-700 transition">
                    {file.name}
                  </div>
                  {file.orderId && (
                    <span className="shrink-0 px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-xs font-mono font-semibold border border-slate-200">
                      #{file.orderId}
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono font-semibold flex items-center gap-2 flex-wrap">
                  <span>{file.size}</span>
                  <span>•</span>
                  <span>{file.uploadedBy}</span>
                  <span>•</span>
                  <span>{file.uploadedAt}</span>
                </div>
              </div>
              <button
                className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-slate-50 rounded-xl transition shrink-0"
                title="Download"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDownload(file);
                }}
              >
                <Download className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
