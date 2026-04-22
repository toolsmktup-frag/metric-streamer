import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, Copy, X, FileText } from 'lucide-react';
import { toast } from 'sonner';

export type MediaType = 'image' | 'video' | 'pdf' | 'document';

interface MediaLightboxProps {
  open: boolean;
  onClose: () => void;
  type: MediaType;
  url: string;
  filename?: string | null;
  mimeType?: string | null;
}

function triggerDownload(url: string, filename?: string | null) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || '';
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

async function copyLink(url: string) {
  try {
    await navigator.clipboard.writeText(url);
    toast.success('Link copiado');
  } catch {
    toast.error('Não foi possível copiar');
  }
}

export default function MediaLightbox({ open, onClose, type, url, filename, mimeType }: MediaLightboxProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[95vw] w-[95vw] h-[92vh] p-0 gap-0 border-0 bg-background/98 backdrop-blur flex flex-col overflow-hidden">
        <DialogTitle className="sr-only">{filename || 'Visualização de mídia'}</DialogTitle>

        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-border shrink-0">
          <div className="text-sm font-medium truncate flex-1 min-w-0">
            {filename || 'Mídia'}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="icon" onClick={() => copyLink(url)} title="Copiar link">
              <Copy className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => triggerDownload(url, filename)} title="Baixar">
              <Download className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose} title="Fechar">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 flex items-center justify-center bg-black/80 overflow-auto">
          {type === 'image' && (
            <img
              src={url}
              alt={filename || 'Imagem'}
              className="max-h-full max-w-full object-contain"
            />
          )}
          {type === 'video' && (
            <video
              src={url}
              controls
              autoPlay
              className="max-h-full max-w-full"
            />
          )}
          {type === 'pdf' && (
            <iframe
              src={url}
              title={filename || 'PDF'}
              className="w-full h-full bg-white"
            />
          )}
          {type === 'document' && (
            <div className="flex flex-col items-center gap-4 p-8 text-center">
              <FileText className="h-20 w-20 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Visualização indisponível para este formato.
              </p>
              <Button onClick={() => triggerDownload(url, filename)}>
                <Download className="h-4 w-4 mr-2" />
                Baixar arquivo
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
