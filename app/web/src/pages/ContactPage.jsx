import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { m as motion } from 'framer-motion';
import { Mail, Phone, MapPin, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import Header from '@/components/Header.jsx';
import Footer from '@/components/Footer.jsx';
import ShoppingCart from '@/components/ShoppingCart.jsx';
import PageBannerSlider from '@/components/PageBannerSlider';
import { pageTitle, BRAND } from '@/lib/brand';
import { APP_API_URL } from '@/lib/supabaseClient';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import TurnstileWidget, { TURNSTILE_WAIT, useTurnstileToken } from '@/components/TurnstileWidget';
import { displayAngolaPhone } from '@/lib/angolaPhone';
import { MOTION } from '@/lib/motion';

const ContactPage = () => {
  // Os contactos vêm de Configurações, como no rodapé. A página mostrava os valores fixos do
  // código — incluindo o telefone provisório — mesmo depois de o painel ter os verdadeiros.
  const { settings } = useSiteSettings();
  const contactEmail = settings.contact_email || '';
  const contactPhone = settings.contact_phone || '';
  const whatsappDigits = String(settings.whatsapp || settings.contact_phone || '').replace(/\D/g, '');
  const telHref = contactPhone ? `tel:${contactPhone.replace(/[^\d+]/g, '')}` : '';
  const contactAddress = settings.contact_address || BRAND.address;
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    message: ''
  });
  const [sending, setSending] = useState(false);
  const human = useTurnstileToken();
  const { toast } = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (settings.turnstile_site_key && !human.token) {
      toast({ title: 'Um momento', description: TURNSTILE_WAIT });
      return;
    }
    setSending(true);
    try {
      const res = await fetch(`${APP_API_URL}/contact-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, ...(human.token ? { turnstileToken: human.token } : {}) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Erro ao enviar mensagem');
      toast({
        title: 'Mensagem enviada',
        description: data.message || 'Entraremos em contacto em breve.',
      });
      setFormData({ name: '', email: '', phone: '', message: '' });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Erro ao enviar',
        description: err.message || 'Tente novamente mais tarde.',
      });
    } finally {
      setSending(false);
      human.reset();
    }
  };

  const handleChange = (e) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  return (
    <>
      <Helmet>
        <title>{pageTitle('Contacto')}</title>
        <meta name="description" content={`Entre em contacto com a ${BRAND.name}. Estamos aqui para ajudar.`} />
      </Helmet>

      <Header onCartOpen={() => setIsCartOpen(true)} />
      <ShoppingCart isCartOpen={isCartOpen} setIsCartOpen={setIsCartOpen} />

      <PageBannerSlider>
        <h1 className="mb-3 text-3xl font-bold leading-tight sm:text-4xl/10 md:text-5xl/none">Contacte-nos</h1>
        <p className="text-base text-white/85 sm:text-lg">Teremos todo o gosto em ouvir de si</p>
      </PageBannerSlider>

      <main className="section-spacing bg-background overflow-x-clip">
        <div className="container-custom">
          {/* No telemóvel, falar já: ligar, WhatsApp e email a um toque, antes do formulário
              (que fica para quem prefere escrever com calma). */}
          {(telHref || whatsappDigits || contactEmail) && (
            <nav aria-label="Contactar já" className="mx-auto mb-8 flex max-w-5xl gap-2 md:hidden">
              {telHref && (
                <a href={telHref} className="flex min-h-16 flex-1 flex-col items-center justify-center gap-1 rounded-xl border border-border bg-card text-sm font-medium text-foreground active:bg-muted">
                  <Phone className="h-5 w-5 text-primary" aria-hidden="true" /> Ligar
                </a>
              )}
              {whatsappDigits && (
                <a href={`https://wa.me/${whatsappDigits}`} target="_blank" rel="noopener noreferrer" className="flex min-h-16 flex-1 flex-col items-center justify-center gap-1 rounded-xl border border-border bg-card text-sm font-medium text-foreground active:bg-muted">
                  <MessageCircle className="h-5 w-5 text-green-600" aria-hidden="true" /> WhatsApp
                </a>
              )}
              {contactEmail && (
                <a href={`mailto:${contactEmail}`} className="flex min-h-16 flex-1 flex-col items-center justify-center gap-1 rounded-xl border border-border bg-card text-sm font-medium text-foreground active:bg-muted">
                  <Mail className="h-5 w-5 text-primary" aria-hidden="true" /> Email
                </a>
              )}
            </nav>
          )}
          <div className="grid md:grid-cols-2 gap-12 max-w-5xl mx-auto">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: MOTION.base, delay: 0.2 }}
            >
              <h2 className="text-2xl font-semibold mb-6 text-foreground">Envie-nos uma mensagem</h2>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <Label htmlFor="name">Nome</Label>
                  <Input
                    id="name"
                    name="name"
                    type="text"
                    autoComplete="name"
                    enterKeyHint="next"
                    value={formData.name}
                    onChange={handleChange}
                    required
                    className="mt-1 bg-input border-border text-foreground"
                  />
                </div>

                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    enterKeyHint="next"
                    value={formData.email}
                    onChange={handleChange}
                    required
                    className="mt-1 bg-input border-border text-foreground"
                  />
                </div>

                <div>
                  <Label htmlFor="phone">Telefone (opcional)</Label>
                  <Input
                    id="phone"
                    name="phone"
                    type="tel"
                    autoComplete="tel"
                    inputMode="tel"
                    enterKeyHint="next"
                    value={formData.phone}
                    onChange={handleChange}
                    className="mt-1 bg-input border-border text-foreground"
                  />
                </div>

                <div>
                  <Label htmlFor="message">Mensagem</Label>
                  <Textarea
                    id="message"
                    name="message"
                    value={formData.message}
                    onChange={handleChange}
                    required
                    rows={6}
                    className="mt-1 bg-input border-border text-foreground"
                  />
                </div>

                <TurnstileWidget siteKey={settings.turnstile_site_key} onToken={human.setToken} resetKey={human.resetKey} action="contacto" />
                <Button type="submit" className="w-full btn-primary" disabled={sending}>
                  {sending ? 'A enviar...' : 'Enviar Mensagem'}
                </Button>
              </form>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: MOTION.base, delay: 0.4 }}
              className="space-y-8"
            >
              <div>
                <h2 className="text-2xl font-semibold mb-6 text-foreground">Informações de Contacto</h2>
                <div className="space-y-6">
                  {contactEmail && (
                    <div className="flex items-start gap-4">
                      <div className="shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <Mail className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-base font-semibold mb-1 text-foreground">Email</h3>
                        <a href={`mailto:${contactEmail}`} className="break-all text-muted-foreground underline-offset-2 hover:text-primary hover:underline">{contactEmail}</a>
                      </div>
                    </div>
                  )}

                  {contactPhone && (
                    <div className="flex items-start gap-4">
                      <div className="shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <Phone className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-base font-semibold mb-1 text-foreground">Telefone</h3>
                        <a href={telHref} className="text-muted-foreground tabular-nums underline-offset-2 hover:text-primary hover:underline">{displayAngolaPhone(contactPhone)}</a>
                      </div>
                    </div>
                  )}

                  <div className="flex items-start gap-4">
                    <div className="shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <MapPin className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold mb-1 text-foreground">Morada</h3>
                      <p className="text-muted-foreground">{contactAddress}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-muted/30 rounded-xl p-6">
                <h3 className="text-lg font-semibold mb-3 text-foreground">Horário de Atendimento</h3>
                <p className="text-muted-foreground text-sm mb-2">Segunda a Sexta: 8h – 17h</p>
                <p className="text-muted-foreground text-sm mb-2">Sábado: 8h – 12h</p>
                <p className="text-muted-foreground text-sm">Domingo: Encerrado</p>
              </div>
            </motion.div>
          </div>
        </div>
      </main>

      <Footer />
    </>
  );
};

export default ContactPage;