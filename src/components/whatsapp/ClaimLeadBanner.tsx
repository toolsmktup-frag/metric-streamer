import { useState } from 'react';
import { UserCheck, UserPlus, Loader2 } from 'lucide-react';
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
  currentOwnerId: string | null;
  currentUserId: string;
}

function getInitials(name: string | null): string {
  return (name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

export default function ClaimLeadBanner({ leadId, currentOwnerId, currentUserId }: Props) {
  const { data: members = [] } = useTeamMembers();
  const assignLead = useAssignLead();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const isUnassigned = !currentOwnerId;
  const owner = currentOwnerId ? members.find(m => m.id === currentOwnerId) : undefined;
  const ownerName = owner?.full_name || 'outro vendedor';

  const handleClaim = () => {
    assignLead.mutate(
      { leadId, assignedTo: currentUserId },
      { onSuccess: () => setConfirmOpen(false) },
    );
  };

  return (
    <>
      <div
        className={
          isUnassigned
            ? 'rounded-lg border border-primary/30 bg-primary/10 p-2.5 flex items-center gap-2'
            : 'rounded-lg border border-border bg-muted/40 p-2.5 flex items-center gap-2'
        }
      >
        <Avatar className="h-7 w-7 shrink-0">
          {!isUnassigned && owner?.avatar_url ? (
            <AvatarImage src={owner.avatar_url} alt={ownerName} />
          ) : null}
          <AvatarFallback
            className={
              isUnassigned
                ? 'text-[10px] font-bold bg-primary text-primary-foreground'
                : 'text-[10px] font-bold bg-primary/15 text-primary'
            }
          >
            {isUnassigned ? <UserPlus className="h-3.5 w-3.5" /> : getInitials(owner?.full_name || null)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          {isUnassigned ? (
            <>
              <p className="text-[11px] font-semibold text-foreground leading-tight whitespace-normal">
                Lead sem responsável
              </p>
              <p className="text-[10px] text-muted-foreground leading-tight">Clique pra assumir</p>
            </>
          ) : (
            <>
              <p className="text-[11px] font-semibold text-foreground leading-tight truncate">
                Lead de <span className="text-primary">{ownerName}</span>
              </p>
              <p className="text-[10px] text-muted-foreground leading-tight">Somente leitura</p>
            </>
          )}
        </div>
        <Button
          size="sm"
          variant={isUnassigned ? 'default' : 'outline'}
          className="h-7 text-[10px] shrink-0"
          onClick={() => setConfirmOpen(true)}
          disabled={assignLead.isPending}
        >
          {assignLead.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <>
              {isUnassigned ? (
                <UserPlus className="h-3 w-3 mr-1" />
              ) : (
                <UserCheck className="h-3 w-3 mr-1" />
              )}
              {isUnassigned ? 'Assumir pra mim' : 'Assumir'}
            </>
          )}
        </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isUnassigned ? 'Assumir este lead?' : 'Assumir este lead?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isUnassigned ? (
                <>Você vai virar a responsável por este lead e poderá editar tudo. Confirmar?</>
              ) : (
                <>
                  O lead será transferido de <strong>{ownerName}</strong> para você.
                  A responsável atual perde a permissão de edição. Deseja continuar?
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={assignLead.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleClaim} disabled={assignLead.isPending}>
              {assignLead.isPending
                ? isUnassigned
                  ? 'Assumindo…'
                  : 'Transferindo…'
                : isUnassigned
                  ? 'Sim, assumir'
                  : 'Sim, assumir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
