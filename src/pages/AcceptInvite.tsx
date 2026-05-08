import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Loader2, Lock, CheckCircle, XCircle, Users } from 'lucide-react';
import { z } from 'zod';

const passwordSchema = z.object({
  password: z.string().min(6, 'A senha deve ter no mínimo 6 caracteres'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'As senhas não coincidem',
  path: ['confirmPassword'],
});

type InviteStatus = 'loading' | 'valid' | 'invalid' | 'expired' | 'accepted' | 'submitting' | 'success';

export default function AcceptInvite() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [status, setStatus] = useState<InviteStatus>('loading');
  const [inviteInfo, setInviteInfo] = useState<{ email: string; tenant_name: string; role: string } | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('invalid');
      return;
    }
    validateToken(token);
  }, [token]);

  const validateToken = async (inviteToken: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('validate-team-invite', {
        body: { invite_token: inviteToken },
      });

      if (error || !data?.valid) {
        setStatus(data?.expired ? 'expired' : 'invalid');
        return;
      }

      setInviteInfo({
        email: data.email,
        tenant_name: data.tenant_name,
        role: data.role,
      });
      setStatus('valid');
    } catch {
      setStatus('invalid');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      passwordSchema.parse({ password, confirmPassword });
    } catch (err) {
      if (err instanceof z.ZodError) {
        setError(err.errors[0].message);
        return;
      }
    }

    setStatus('submitting');

    try {
      const { data, error } = await supabase.functions.invoke('accept-team-invite', {
        body: { invite_token: token, password },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setStatus('success');

      if (data?.already_member) {
        toast.info('Você já faz parte desta equipe.');
      } else {
        toast.success('Conta criada com sucesso!');
      }

      // Auto-login after 2 seconds
      setTimeout(() => {
        navigate('/auth');
      }, 3000);
    } catch (err) {
      setStatus('valid');
      const msg = err instanceof Error ? err.message : 'Erro ao aceitar convite';
      setError(msg);
      toast.error(msg);
    }
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="pt-6">
            <div className="text-center">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary mb-4" />
              <p className="text-muted-foreground">Verificando convite...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === 'invalid' || status === 'expired') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="pt-6">
            <div className="text-center">
              <XCircle className="w-12 h-12 mx-auto text-destructive mb-4" />
              <h3 className="text-lg font-semibold mb-2">
                {status === 'expired' ? 'Convite Expirado' : 'Convite Inválido'}
              </h3>
              <p className="text-muted-foreground mb-4">
                {status === 'expired'
                  ? 'Este convite expirou. Solicite um novo convite ao administrador da equipe.'
                  : 'Este link de convite é inválido ou já foi utilizado.'}
              </p>
              <Button variant="outline" onClick={() => navigate('/auth')}>
                Ir para Login
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="pt-6">
            <div className="text-center">
              <CheckCircle className="w-12 h-12 mx-auto text-primary mb-4" />
              <h3 className="text-lg font-semibold mb-2">Conta Criada!</h3>
              <p className="text-muted-foreground mb-4">
                Sua conta foi criada e você foi adicionado à equipe <strong>{inviteInfo?.tenant_name}</strong>.
                Redirecionando para o login...
              </p>
              <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="max-w-md w-full mx-4">
        <CardHeader className="text-center">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-2">
            <Users className="w-6 h-6 text-primary" />
          </div>
          <CardTitle>Convite para Equipe</CardTitle>
          <CardDescription>
            Você foi convidado para a equipe <strong>{inviteInfo?.tenant_name}</strong> como{' '}
            <strong>{inviteInfo?.role === 'admin' ? 'Administrador' : 'Membro'}</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={inviteInfo?.email || ''} disabled className="bg-muted" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="invite-password">Criar Senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="invite-password"
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10"
                  required
                  minLength={6}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="invite-confirm-password">Confirmar Senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="invite-confirm-password"
                  type="password"
                  placeholder="Repita a senha"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="pl-10"
                  required
                  minLength={6}
                />
              </div>
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={status === 'submitting'}
            >
              {status === 'submitting' ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Criando conta...
                </>
              ) : (
                'Aceitar Convite e Criar Conta'
              )}
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              Já tem uma conta?{' '}
              <a href="/auth" className="text-primary hover:underline">
                Faça login
              </a>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
