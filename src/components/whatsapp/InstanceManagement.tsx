import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import {
  Wifi,
  WifiOff,
  QrCode,
  RefreshCw,
  Trash2,
  User,
  Users,
  Camera,
  Shield,
  Loader2,
  Smartphone,
  Copy,
  Check,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { WhatsAppInstance } from '@/hooks/useWhatsApp';
import { getInstanceDisplayName } from '@/hooks/useWhatsApp';
import InstanceAccessManager from '@/components/whatsapp/InstanceAccessManager';

async function callInstanceAPI(instanceId: string, action: string, body: any = {}) {
  const { data, error } = await supabase.functions.invoke('whatsapp-instance', {
    body: { instance_id: instanceId, action, ...body },
  });
  if (error) throw new Error(error.message || `API error`);
  return data;
}

interface InstanceManagementProps {
  instance: WhatsAppInstance | null;
  instances?: WhatsAppInstance[];
  onInstanceDeleted?: () => void;
}

export default function InstanceManagement({
  instance,
  instances = [],
  onInstanceDeleted,
}: InstanceManagementProps) {
  const [loading, setLoading] = useState(false);
  const [statusData, setStatusData] = useState<any>(null);
  const [profileName, setProfileName] = useState('');
  const [profileImageUrl, setProfileImageUrl] = useState('');
  const [instanceName, setInstanceName] = useState('');
  const [nickname, setNickname] = useState('');
  const [privacy, setPrivacy] = useState<any>(null);
  const [pairCode, setPairCode] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectPhone, setConnectPhone] = useState('');

  const fetchStatus = useCallback(async () => {
    if (!instance) return;
    setLoading(true);
    try {
      const data = await callInstanceAPI(instance.id, 'status');
      setStatusData(data);
      if (data?.processed?.display_name) {
        setProfileName(data.processed.display_name);
      }
      
      const currentStatus = data?.processed?.status || 'disconnected';
      
      // Extract QR code / pair code from status if instance is connecting
      const qr = data?.raw?.instance?.qrcode || data?.qrcode;
      const pc = data?.raw?.instance?.paircode || data?.paircode;
      
      if (currentStatus === 'connecting' || qr || pc) {
        if (qr && qr.length > 10) setQrCode(qr);
        if (pc && pc.length > 2) setPairCode(pc);
        setConnecting(true);
      } else if (currentStatus === 'connected') {
        setQrCode(null);
        setPairCode(null);
        setConnecting(false);
      } else {
        // disconnected - reset
        setQrCode(null);
        setPairCode(null);
        setConnecting(false);
      }
    } catch (err: any) {
      console.error('Status fetch error:', err);
      setStatusData({ processed: { status: 'disconnected' } });
    } finally {
      setLoading(false);
    }
  }, [instance]);

  const fetchPrivacy = useCallback(async () => {
    if (!instance) return;
    try {
      const data = await callInstanceAPI(instance.id, 'get_privacy');
      setPrivacy(data);
    } catch (err: any) {
      console.error('Privacy fetch error:', err);
    }
  }, [instance]);

  useEffect(() => {
    if (instance) {
      setInstanceName(instance.instance_name);
      setNickname(instance.nickname || '');
      setProfileName(instance.display_name || '');
      setConnectPhone('');
      // Don't reset qrCode/pairCode/connecting here — fetchStatus will set them correctly
      fetchStatus();
      fetchPrivacy();
    }
  }, [instance, fetchStatus, fetchPrivacy]);

  // Poll status while connecting
  useEffect(() => {
    if (!connecting || !instance) return;
    const interval = setInterval(async () => {
      try {
        const data = await callInstanceAPI(instance.id, 'status');
        setStatusData(data);
        if (data?.processed?.status === 'connected') {
          setConnecting(false);
          setPairCode(null);
          setQrCode(null);
          toast.success('WhatsApp conectado!');
        }
        const qr = data?.raw?.instance?.qrcode || data?.instance?.qrcode || data?.qrcode || data?.base64;
        if (qr) setQrCode(qr);
        const pc = data?.raw?.instance?.paircode || data?.instance?.paircode || data?.paircode;
        if (pc) setPairCode(pc);
      } catch {}
    }, 3000);
    return () => clearInterval(interval);
  }, [connecting, instance]);

  if (!instance) return null;

  const instanceStatus = statusData?.processed?.status || instance.status;
  const isConnected = instanceStatus === 'connected';
  const isConnecting = instanceStatus === 'connecting';

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const body: any = {};
      if (connectPhone.trim()) body.phone = connectPhone.trim();
      const data = await callInstanceAPI(instance.id, 'connect', body);
      console.log('[WhatsApp Connect] Full response:', JSON.stringify(data));
      // Check top-level first (normalized by edge function), then fallback paths
      const paircode = data?.paircode || data?.raw?.instance?.paircode || data?.instance?.paircode;
      const qrcode = data?.qrcode || data?.raw?.instance?.qrcode || data?.instance?.qrcode || data?.raw?.qrcode || data?.base64;
      console.log('[WhatsApp Connect] qrcode found:', qrcode ? `${String(qrcode).substring(0, 50)}...` : 'null');
      console.log('[WhatsApp Connect] paircode found:', paircode || 'null');
      if (paircode) setPairCode(paircode);
      if (qrcode) setQrCode(qrcode);
      setStatusData(data);
      toast.info(connectPhone.trim()
        ? 'Código de pareamento gerado! Use-o no WhatsApp.'
        : 'QR Code gerado! Escaneie no WhatsApp.');
    } catch (err: any) {
      toast.error(err.message);
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await callInstanceAPI(instance.id, 'disconnect');
      toast.success('Instância desconectada');
      setStatusData(null);
      setPairCode(null);
      setQrCode(null);
      fetchStatus();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleUpdateProfileName = async () => {
    if (!profileName.trim()) return;
    try {
      await callInstanceAPI(instance.id, 'update_name', { name: profileName.trim() });
      toast.success('Nome do perfil atualizado!');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleUpdateProfileImage = async () => {
    if (!profileImageUrl.trim()) return;
    try {
      await callInstanceAPI(instance.id, 'update_image', { image: profileImageUrl.trim() });
      toast.success('Foto do perfil atualizada!');
      setProfileImageUrl('');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleRemoveProfileImage = async () => {
    try {
      await callInstanceAPI(instance.id, 'update_image', { image: 'remove' });
      toast.success('Foto do perfil removida');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleUpdateInstanceName = async () => {
    if (!instanceName.trim()) return;
    try {
      await callInstanceAPI(instance.id, 'update_instance_name', { name: instanceName.trim() });
      toast.success('Nome da instância atualizado!');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleUpdateNickname = async () => {
    try {
      const { error } = await (supabase as any)
        .from('whatsapp_instances')
        .update({ nickname: nickname.trim() || null })
        .eq('id', instance.id);
      if (error) throw error;
      toast.success('Apelido atualizado!');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar apelido');
    }
  };

  const handleUpdatePrivacy = async (key: string, value: string) => {
    try {
      await callInstanceAPI(instance.id, 'set_privacy', { settings: { [key]: value } });
      setPrivacy((prev: any) => ({ ...prev, [key]: value }));
      toast.success('Privacidade atualizada');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Tem certeza que deseja deletar esta instância? Esta ação é irreversível.')) return;
    try {
      await callInstanceAPI(instance.id, 'delete');
      toast.success('Instância deletada');
      onInstanceDeleted?.();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const copyPairCode = () => {
    if (pairCode) {
      navigator.clipboard.writeText(pairCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const privacyOptions = [
    { value: 'all', label: 'Todos' },
    { value: 'contacts', label: 'Contatos' },
    { value: 'contact_blacklist', label: 'Contatos (exceto bloqueados)' },
    { value: 'none', label: 'Ninguém' },
  ];

  return (
    <div className="space-y-6">
      {/* Status Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Status</h3>
          <Button variant="ghost" size="sm" onClick={fetchStatus} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border">
          {isConnected ? (
            <Wifi className="h-5 w-5 text-emerald-500" />
          ) : (
            <WifiOff className="h-5 w-5 text-destructive" />
          )}
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">
              {getInstanceDisplayName(instance)}
            </p>
            <p className="text-xs text-muted-foreground">{instance.phone_number || 'Sem número'}</p>
          </div>
          <Badge variant={isConnected ? 'default' : 'destructive'} className="text-xs">
            {isConnected ? 'Conectado' : isConnecting ? 'Conectando...' : 'Desconectado'}
          </Badge>
        </div>

        {statusData?.processed?.display_name && (
          <p className="text-xs text-muted-foreground">
            Perfil: {statusData.processed.display_name}
          </p>
        )}

        {/* Connect/Disconnect buttons */}
        <div className="flex gap-2">
          {!isConnected && !connecting && (
            <div className="flex-1 space-y-2">
              <Input
                placeholder="Número (ex: 5511999999999) ou vazio p/ QR"
                value={connectPhone}
                onChange={e => setConnectPhone(e.target.value)}
                className="h-8 text-xs"
              />
              <Button size="sm" className="w-full gap-1.5" onClick={handleConnect}>
                <QrCode className="h-3.5 w-3.5" />
                {connectPhone.trim() ? 'Gerar Código de Pareamento' : 'Gerar QR Code'}
              </Button>
            </div>
          )}
          {isConnected && (
            <Button variant="destructive" size="sm" className="gap-1.5" onClick={handleDisconnect}>
              <WifiOff className="h-3.5 w-3.5" />
              Desconectar
            </Button>
          )}
        </div>

        {/* Pair Code Display */}
        {pairCode && (
          <div className="p-4 rounded-lg bg-primary/5 border border-primary/20 text-center space-y-2">
            <p className="text-xs text-muted-foreground">Código de Pareamento</p>
            <div className="flex items-center justify-center gap-2">
              <span className="text-2xl font-mono font-bold tracking-widest text-foreground">
                {pairCode}
              </span>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={copyPairCode}>
                {copiedCode ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              WhatsApp → Dispositivos conectados → Conectar dispositivo → Usar código
            </p>
          </div>
        )}

        {/* QR Code Display */}
        {qrCode && !pairCode && (
          <div className="p-4 rounded-lg bg-card border border-border text-center space-y-2">
            <p className="text-xs text-muted-foreground">Escaneie o QR Code no WhatsApp</p>
            <img
              src={qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`}
              alt="QR Code"
              className="mx-auto w-48 h-48 rounded"
            />
            <p className="text-[10px] text-muted-foreground">
              WhatsApp → Dispositivos conectados → Conectar dispositivo
            </p>
          </div>
        )}

        {connecting && !pairCode && !qrCode && (
          <div className="flex items-center justify-center gap-2 p-4 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-xs">Aguardando conexão...</span>
          </div>
        )}
      </div>

      <Separator />

      {/* Nickname (Apelido) */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          <Smartphone className="h-3.5 w-3.5" /> Apelido
        </h3>
        <p className="text-[11px] text-muted-foreground">
          Nome amigável exibido nos seletores e badges. Não afeta a API.
        </p>
        <div className="flex gap-2">
          <Input
            value={nickname}
            onChange={e => setNickname(e.target.value)}
            className="h-8 text-sm flex-1"
            placeholder="Ex: Vendas SP, Suporte, etc."
          />
          <Button size="sm" variant="outline" onClick={handleUpdateNickname}>
            Salvar
          </Button>
        </div>
      </div>

      <Separator />

      {/* Instance Name */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          <Smartphone className="h-3.5 w-3.5" /> Nome da Instância (técnico)
        </h3>
        <div className="flex gap-2">
          <Input
            value={instanceName}
            onChange={e => setInstanceName(e.target.value)}
            className="h-8 text-sm flex-1"
            placeholder="Nome interno"
          />
          <Button size="sm" variant="outline" onClick={handleUpdateInstanceName}>
            Salvar
          </Button>
        </div>
      </div>

      <Separator />

      {/* Profile Section */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          <User className="h-3.5 w-3.5" /> Perfil do WhatsApp
        </h3>

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Nome de exibição (máx. 25 caracteres)</Label>
          <div className="flex gap-2">
            <Input
              value={profileName}
              onChange={e => setProfileName(e.target.value)}
              maxLength={25}
              className="h-8 text-sm flex-1"
              placeholder="Nome do perfil"
              disabled={!isConnected}
            />
            <Button size="sm" variant="outline" onClick={handleUpdateProfileName} disabled={!isConnected}>
              Salvar
            </Button>
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground flex items-center gap-1">
            <Camera className="h-3 w-3" /> Foto do perfil
          </Label>
          <div className="flex gap-2">
            <Input
              value={profileImageUrl}
              onChange={e => setProfileImageUrl(e.target.value)}
              className="h-8 text-sm flex-1"
              placeholder="URL da imagem (JPEG 640x640)"
              disabled={!isConnected}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={handleUpdateProfileImage}
              disabled={!isConnected || !profileImageUrl.trim()}
            >
              Enviar
            </Button>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="text-xs text-destructive"
            onClick={handleRemoveProfileImage}
            disabled={!isConnected}
          >
            Remover foto atual
          </Button>
        </div>
      </div>

      <Separator />

      {/* Privacy Section */}
      {privacy && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5" /> Privacidade
          </h3>

          {[
            { key: 'profile', label: 'Foto do perfil' },
            { key: 'last', label: 'Visto por último' },
            { key: 'status', label: 'Recado' },
            { key: 'groupadd', label: 'Adicionar a grupos' },
          ].map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between">
              <span className="text-xs text-foreground">{label}</span>
              <Select
                value={privacy[key] || 'all'}
                onValueChange={v => handleUpdatePrivacy(key, v)}
                disabled={!isConnected}
              >
                <SelectTrigger className="w-[160px] h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {privacyOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value} className="text-xs">
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}

          <div className="flex items-center justify-between">
            <span className="text-xs text-foreground">Confirmação de leitura</span>
            <Select
              value={privacy.readreceipts || 'all'}
              onValueChange={v => handleUpdatePrivacy('readreceipts', v)}
              disabled={!isConnected}
            >
              <SelectTrigger className="w-[160px] h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">Todos</SelectItem>
                <SelectItem value="none" className="text-xs">Ninguém</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs text-foreground">Status online</span>
            <Select
              value={privacy.online || 'all'}
              onValueChange={v => handleUpdatePrivacy('online', v)}
              disabled={!isConnected}
            >
              <SelectTrigger className="w-[160px] h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">Todos</SelectItem>
                <SelectItem value="match_last_seen" className="text-xs">Igual ao visto por último</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      <Separator />

      {/* Webhook Section */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" /> Webhook
        </h3>
        <p className="text-xs text-muted-foreground">
          Configura automaticamente o webhook para receber mensagens na plataforma.
        </p>
        <Button
          size="sm"
          variant="outline"
          className="w-full gap-1.5"
          onClick={async () => {
            try {
              await callInstanceAPI(instance.id, 'set_webhook');
              toast.success('Webhook configurado com sucesso!');
            } catch (err: any) {
              toast.error('Erro ao configurar webhook: ' + err.message);
            }
          }}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Configurar Webhook
        </Button>
      </div>

      <Separator />

      {/* Access Management */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5" /> Acesso de Vendedores
        </h3>
        <InstanceAccessManager
          instances={instances}
          selectedInstanceId={instance?.id || null}
        />
      </div>

      <Separator />

      {/* Danger Zone */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-destructive">Zona de Perigo</h3>
        <Button
          variant="destructive"
          size="sm"
          className="gap-1.5 w-full"
          onClick={handleDelete}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Deletar Instância
        </Button>
      </div>
    </div>
  );
}
