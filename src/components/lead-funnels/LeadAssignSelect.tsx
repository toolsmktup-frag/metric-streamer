import React from 'react';
import { useTeamMembers, ROLE_LABELS } from '@/hooks/useTeamMembers';
import { useAssignLead } from '@/hooks/useAssignLead';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { UserPlus } from 'lucide-react';

interface LeadAssignSelectProps {
  leadId: string;
  currentAssignedTo: string | null;
  compact?: boolean;
  userRole?: string;
  currentUserId?: string;
}

function getInitials(name: string | null): string {
  return (name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

const LeadAssignSelect: React.FC<LeadAssignSelectProps> = ({ leadId, currentAssignedTo, compact, userRole, currentUserId }) => {
  const { data: members = [] } = useTeamMembers();
  const assignLead = useAssignLead();

  const isSeller = userRole === 'vendedor' || userRole === 'vendedora' || userRole === 'suporte';
  const isAdmin = userRole === 'admin' || userRole === 'gestor';

  // Seller can only assign cards that are unassigned or assigned to themselves
  const canAssign = !userRole || isAdmin || !currentAssignedTo || currentAssignedTo === currentUserId;

  const assignableMembers = members.filter(m =>
    ['vendedor', 'vendedora', 'suporte'].includes(m.role) && m.status === 'active'
  );

  const handleChange = (value: string) => {
    const assignedTo = value === '__none__' ? null : value;
    assignLead.mutate({ leadId, assignedTo });
  };

  const currentMember = members.find(m => m.id === currentAssignedTo);

  if (compact) {
    return (
      <Select value={currentAssignedTo || '__none__'} onValueChange={handleChange} disabled={!canAssign}>
        <SelectTrigger
          className={`h-6 w-6 p-0 border-0 bg-transparent [&>svg]:hidden ${!canAssign ? 'opacity-50 cursor-not-allowed' : ''}`}
          title={!canAssign ? 'Apenas o responsável pode transferir' : (currentMember?.full_name || 'Atribuir vendedor')}
        >
          <Avatar className="h-6 w-6">
            {currentMember?.avatar_url ? (
              <AvatarImage src={currentMember.avatar_url} alt={currentMember.full_name || 'Vendedor'} />
            ) : null}
            <AvatarFallback className={`text-[10px] font-bold ${currentAssignedTo ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}`}>
              {currentMember
                ? getInitials(currentMember.full_name)
                : <UserPlus className="h-3 w-3" />}
            </AvatarFallback>
          </Avatar>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">
            <span className="text-muted-foreground">Sem vendedor</span>
          </SelectItem>
          {assignableMembers.map(m => (
            <SelectItem key={m.id} value={m.id}>
              <div className="flex items-center gap-2">
                <Avatar className="h-5 w-5">
                  {m.avatar_url ? <AvatarImage src={m.avatar_url} alt={m.full_name || ''} /> : null}
                  <AvatarFallback className="text-[8px] font-bold">{getInitials(m.full_name)}</AvatarFallback>
                </Avatar>
                <span>{m.full_name || 'Sem nome'}</span>
                <span className="text-[10px] text-muted-foreground">{ROLE_LABELS[m.role] || m.role}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <Select value={currentAssignedTo || '__none__'} onValueChange={handleChange}>
      <SelectTrigger className="h-8 text-xs">
        <SelectValue placeholder="Atribuir vendedor..." />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">
          <span className="text-muted-foreground">Sem vendedor</span>
        </SelectItem>
        {assignableMembers.map(m => (
          <SelectItem key={m.id} value={m.id}>
            <div className="flex items-center gap-2">
              <Avatar className="h-5 w-5">
                {m.avatar_url ? <AvatarImage src={m.avatar_url} alt={m.full_name || ''} /> : null}
                <AvatarFallback className="text-[8px] font-bold">{getInitials(m.full_name)}</AvatarFallback>
              </Avatar>
              <span>{m.full_name || 'Sem nome'}</span>
              <span className="text-[10px] text-muted-foreground">{ROLE_LABELS[m.role] || m.role}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export default LeadAssignSelect;
