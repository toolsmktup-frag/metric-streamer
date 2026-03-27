import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Camera, Save, KeyRound, Loader2, Sun, Moon, Monitor, ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useTheme } from '@/hooks/useTheme';
import { useNavigate } from 'react-router-dom';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

export default function UserSettings() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const fileRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingPwd, setSavingPwd] = useState(false);

  const [userId, setUserId] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      setUserId(user.id);
      setEmail(user.email ?? '');

      const { data: profile } = await (supabase as any)
        .from('user_profiles')
        .select('full_name, avatar_url')
        .eq('id', user.id)
        .maybeSingle();

      if (profile) {
        setName(profile.full_name || '');
        setAvatarUrl(profile.avatar_url || null);
      }
      setLoading(false);
    }
    load();
  }, []);

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const { error } = await (supabase as any)
        .from('user_profiles')
        .update({ full_name: name })
        .eq('id', userId);

      if (error) throw error;
      toast({ title: 'Perfil atualizado com sucesso' });
    } catch {
      toast({ title: 'Erro ao salvar perfil', variant: 'destructive' });
    }
    setSaving(false);
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 6) {
      toast({ title: 'A senha deve ter no mínimo 6 caracteres', variant: 'destructive' });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: 'As senhas não coincidem', variant: 'destructive' });
      return;
    }
    setSavingPwd(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast({ title: 'Senha alterada com sucesso' });
      setNewPassword('');
      setConfirmPassword('');
    } catch {
      toast({ title: 'Erro ao alterar senha', variant: 'destructive' });
    }
    setSavingPwd(false);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split('.').pop();
    const path = `${userId}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true });

    if (uploadErr) {
      toast({ title: 'Erro ao enviar foto', variant: 'destructive' });
      return;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('avatars')
      .getPublicUrl(path);

    const url = `${publicUrl}?t=${Date.now()}`;

    await (supabase as any)
      .from('user_profiles')
      .update({ avatar_url: url })
      .eq('id', userId);

    setAvatarUrl(url);
    toast({ title: 'Foto atualizada' });
  };

  const initials = name
    ? name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-8">
      <h1 className="text-2xl font-bold text-foreground">Configurações</h1>

      {/* Avatar */}
      <div className="flex items-center gap-4">
        <div className="relative group">
          <Avatar className="h-20 w-20">
            {avatarUrl && <AvatarImage src={avatarUrl} alt={name} />}
            <AvatarFallback className="text-lg bg-primary text-primary-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
          <button
            onClick={() => fileRef.current?.click()}
            className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Camera className="h-5 w-5 text-white" />
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">{name || 'Sem nome'}</p>
          <p className="text-xs text-muted-foreground">{email}</p>
        </div>
      </div>

      {/* Nome */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Nome</label>
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="Seu nome" />
      </div>

      {/* Email (read-only) */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Email</label>
        <Input value={email} disabled className="opacity-60" />
      </div>

      <Button onClick={handleSaveProfile} disabled={saving} className="gap-2">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Salvar perfil
      </Button>

      {/* Aparência */}
      <div className="border-t border-border pt-6 space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Aparência</h2>
        <ToggleGroup type="single" value={theme} onValueChange={(v) => v && setTheme(v as 'light' | 'dark' | 'system')}>
          <ToggleGroupItem value="light" aria-label="Claro" className="gap-2 px-4">
            <Sun className="h-4 w-4" /> Claro
          </ToggleGroupItem>
          <ToggleGroupItem value="dark" aria-label="Escuro" className="gap-2 px-4">
            <Moon className="h-4 w-4" /> Escuro
          </ToggleGroupItem>
          <ToggleGroupItem value="system" aria-label="Sistema" className="gap-2 px-4">
            <Monitor className="h-4 w-4" /> Sistema
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* Alterar Senha */}
      <div className="border-t border-border pt-6 space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Alterar senha</h2>
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Nova senha</label>
          <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Confirmar senha</label>
          <Input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Repita a senha" />
        </div>
        <Button onClick={handleChangePassword} disabled={savingPwd} variant="outline" className="gap-2">
          {savingPwd ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
          Alterar senha
        </Button>
      </div>
    </div>
  );
}
