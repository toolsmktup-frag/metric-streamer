import { useState } from 'react';
import { UserCheck, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { useAssignLead } from '@/hooks/useAssignLead';

interface Props {
  leadId: string;
  currentOwnerId: string;
  currentUserId: string;
}

function getInitials(name: string | null): string {
  return (name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

export default function ClaimLeadBanner({ leadId, currentOwnerId, currentUserId }: Props) {
  const { data: members = [] } = useTeamMembers();
  const assignLead = useAssignLead();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const owner = members.find(m => m.id === currentOwnerId);
  const ownerName = owner?.full_name || 'outro vendedor';

  const handleClaim = () => {
    assignLead.mutate(
      { leadId, assignedTo: currentUserId },
      { onSuccess: () => setConfirmOpen(false) },
    );
  };

  return (
    <>
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5 flex items-center gap-2">
        <Avatar className="h-7 w-7 shrink-0">
          {owner?.avatar_url ? <AvatarImage src={owner.avatar_url} alt={ownerName} /> : null}
          <AvatarFallback className="text-[10px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-400">
            {getInitials(owner?.full_name || null)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-medium text-foreground truncate">
            Lead de <span className="text-amber-700 dark:text-amber-400">{ownerName}</span>
          </p>
          <p className="text-[10px] text-muted-foreground">Visualização somente leitura</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-[10px] shrink-0 border-amber-500/40 hover:bg-amber-500/10"
          onClick={() => setConfirmOpen(true)}
          disabled={assignLead.isPending}
        >
          {assignLead.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <>
              <UserCheck className="h-3 w-3 mr-1" />
              Assumir
            </>
          )}
        </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Assumir este lead?</AlertDialogTitle>
            <AlertDialogDescription>
              O lead será transferido de <strong>{ownerName}</strong> para você.
              A responsável atual perde a permissão de edição. Deseja continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={assignLead.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleClaim} disabled={assignLead.isPending}>
              {assignLead.isPending ? 'Transferindo…' : 'Sim, assumir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
