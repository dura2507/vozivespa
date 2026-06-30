import type { Locale } from "@/lib/i18n/config";
import { BRAND } from "@/lib/mockData";

// Translation strings used by both legal pages. Kept lean — these are
// supporting labels, the bulk of the privacy / imprint text lives in
// the JSX renderers below per locale.
export const LEGAL_STRINGS: Record<
  Locale,
  {
    privacyTitle: string;
    imprintTitle: string;
    backHome: string;
  }
> = {
  en: { privacyTitle: "Privacy Policy", imprintTitle: "Imprint", backHome: "← Back home" },
  de: { privacyTitle: "Datenschutzerklärung", imprintTitle: "Impressum", backHome: "← Zur Startseite" },
  hr: { privacyTitle: "Politika privatnosti", imprintTitle: "Impressum", backHome: "← Natrag na početnu" },
  it: { privacyTitle: "Informativa sulla privacy", imprintTitle: "Note legali", backHome: "← Torna alla home" },
  pl: { privacyTitle: "Polityka prywatności", imprintTitle: "Impressum", backHome: "← Powrót do strony głównej" },
  fr: { privacyTitle: "Politique de confidentialité", imprintTitle: "Mentions légales", backHome: "← Retour à l'accueil" },
  es: { privacyTitle: "Política de privacidad", imprintTitle: "Aviso legal", backHome: "← Volver al inicio" },
  hu: { privacyTitle: "Adatvédelmi szabályzat", imprintTitle: "Impresszum", backHome: "← Vissza a főoldalra" },
  sk: { privacyTitle: "Zásady ochrany osobných údajov", imprintTitle: "Impressum", backHome: "← Späť na úvod" },
  cs: { privacyTitle: "Zásady ochrany osobních údajů", imprintTitle: "Impressum", backHome: "← Zpět na úvod" },
  pt: { privacyTitle: "Política de Privacidade", imprintTitle: "Informações legais", backHome: "← Voltar ao início" },
};

// Shared contact block referenced across both pages.
function ContactBlock() {
  return (
    <address className="not-italic text-ink/80 text-sm">
      <p className="font-semibold text-ink">{BRAND.legal}</p>
      <p>{BRAND.address}</p>
      <p>Croatia</p>
      <p className="mt-2">OIB: {BRAND.oib}</p>
      <p>
        Email:{" "}
        <a href={`mailto:${BRAND.email}`} className="text-red hover:underline">
          {BRAND.email}
        </a>
      </p>
    </address>
  );
}

export function PrivacyContent({ locale }: { locale: Locale }) {
  switch (locale) {
    case "de":
      return (
        <article className="prose-content space-y-6 text-ink">
          <p>
            Diese Website wird von {BRAND.legal} (nachfolgend „wir") betrieben. Wir
            nehmen den Schutz Ihrer Daten ernst. Diese Erklärung beschreibt, welche
            Daten wir verarbeiten und wofür.
          </p>

          <h2 className="text-xl font-bold mt-8">1. Welche Daten wir verarbeiten</h2>
          <ul className="list-disc pl-5 space-y-2 text-sm">
            <li>
              <b>Buchungsdaten:</b> Name, E-Mail, Telefon, Mietzeitraum, Zahlungsart,
              Zahlungsbeleg. Werden gespeichert, um Ihre Buchung abzuwickeln und zur
              Erfüllung gesetzlicher Aufbewahrungspflichten (bis zu 10 Jahre).
            </li>
            <li>
              <b>Kontaktformular:</b> Name, E-Mail, Nachricht. Zur Beantwortung Ihrer
              Anfrage.
            </li>
            <li>
              <b>Anonyme Statistik:</b> Aufgerufener Seitenpfad, Land, Sprache und ein
              täglich rotierender Hash aus IP + User-Agent. Keine Cookies, keine
              persönliche Identifikation möglich.
            </li>
            <li>
              <b>Google-Ads-Cookies (nur bei Einwilligung):</b> Google misst die
              Wirksamkeit unserer Werbeanzeigen. Verarbeitet von Google Ireland Ltd.
            </li>
          </ul>

          <h2 className="text-xl font-bold mt-8">2. Rechtsgrundlagen</h2>
          <ul className="list-disc pl-5 space-y-1 text-sm">
            <li>Buchungen + Kontakt: Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung)</li>
            <li>Anonyme Statistik: Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse)</li>
            <li>Google Ads: Art. 6 Abs. 1 lit. a DSGVO (Einwilligung)</li>
          </ul>

          <h2 className="text-xl font-bold mt-8">3. Auftragsverarbeiter</h2>
          <ul className="list-disc pl-5 space-y-1 text-sm">
            <li>Supabase Inc., USA (Datenbank-Hosting)</li>
            <li>Vercel Inc., USA (Web-Hosting)</li>
            <li>Resend (transaktionale E-Mails)</li>
            <li>Telegram FZ-LLC (Owner-Benachrichtigungen, enthält Buchungsdaten)</li>
            <li>Google Ireland Ltd. (nur bei Cookie-Einwilligung)</li>
          </ul>

          <h2 className="text-xl font-bold mt-8">4. Ihre Rechte</h2>
          <p className="text-sm">
            Sie haben jederzeit das Recht auf Auskunft, Berichtigung, Löschung,
            Einschränkung und Datenübertragbarkeit. Eine erteilte Einwilligung können
            Sie jederzeit über den Link „Cookie-Einstellungen" im Footer widerrufen.
            Sie können sich außerdem bei der zuständigen Aufsichtsbehörde beschweren
            (in Kroatien: AZOP, www.azop.hr).
          </p>

          <h2 className="text-xl font-bold mt-8">5. Verantwortlicher</h2>
          <ContactBlock />

          <p className="text-xs text-muted mt-8">
            Stand: Mai 2026. Diese Erklärung dient der Information und ersetzt keine
            individuelle Rechtsberatung.
          </p>
        </article>
      );

    // Languages without a dedicated privacy translation fall back to the
    // English policy (hu, sk, cs, pt). Titles/back-link are still localised.
    default:
    case "en":
      return (
        <article className="prose-content space-y-6 text-ink">
          <p>
            This website is operated by {BRAND.legal} ("we", "us"). We take the
            protection of your data seriously. This page explains what we collect
            and what we use it for.
          </p>

          <h2 className="text-xl font-bold mt-8">1. What we process</h2>
          <ul className="list-disc pl-5 space-y-2 text-sm">
            <li>
              <b>Booking data:</b> name, email, phone, rental window, payment method,
              payment receipt. Stored to process your booking and to satisfy legal
              record-keeping obligations (up to 10 years).
            </li>
            <li>
              <b>Contact form:</b> name, email, message. Used to reply to your enquiry.
            </li>
            <li>
              <b>Anonymous analytics:</b> page path, country, locale and a daily-rotated
              hash of IP + user-agent. No cookies, no personal identification possible.
            </li>
            <li>
              <b>Google Ads cookies (only with consent):</b> Google measures the
              performance of our adverts. Processed by Google Ireland Ltd.
            </li>
          </ul>

          <h2 className="text-xl font-bold mt-8">2. Legal basis</h2>
          <ul className="list-disc pl-5 space-y-1 text-sm">
            <li>Bookings + contact: Art. 6(1)(b) GDPR (contract)</li>
            <li>Anonymous analytics: Art. 6(1)(f) GDPR (legitimate interest)</li>
            <li>Google Ads: Art. 6(1)(a) GDPR (consent)</li>
          </ul>

          <h2 className="text-xl font-bold mt-8">3. Data processors</h2>
          <ul className="list-disc pl-5 space-y-1 text-sm">
            <li>Supabase Inc., USA (database hosting)</li>
            <li>Vercel Inc., USA (web hosting)</li>
            <li>Resend (transactional email)</li>
            <li>Telegram FZ-LLC (owner notifications, contains booking data)</li>
            <li>Google Ireland Ltd. (only after cookie consent)</li>
          </ul>

          <h2 className="text-xl font-bold mt-8">4. Your rights</h2>
          <p className="text-sm">
            You have the right to access, correct, delete, restrict or port your
            data. Consent given can be withdrawn at any time via the "Cookie
            settings" link in the footer. You may also lodge a complaint with the
            relevant supervisory authority (in Croatia: AZOP, www.azop.hr).
          </p>

          <h2 className="text-xl font-bold mt-8">5. Controller</h2>
          <ContactBlock />

          <p className="text-xs text-muted mt-8">
            Last updated: May 2026. This statement is for information only and does
            not replace individual legal advice.
          </p>
        </article>
      );

    case "hr":
      return (
        <article className="prose-content space-y-6 text-ink">
          <p>
            Ovu web stranicu vodi {BRAND.legal} ("mi"). Ozbiljno shvaćamo zaštitu
            vaših podataka. Ova izjava objašnjava koje podatke obrađujemo i zašto.
          </p>
          <h2 className="text-xl font-bold mt-8">1. Koje podatke obrađujemo</h2>
          <ul className="list-disc pl-5 space-y-2 text-sm">
            <li><b>Rezervacije:</b> ime, e-mail, telefon, razdoblje najma, način plaćanja, potvrda uplate. Pohranjuju se radi obrade rezervacije i ispunjavanja zakonskih obveza (do 10 godina).</li>
            <li><b>Kontakt obrazac:</b> ime, e-mail, poruka — koristi se za odgovor.</li>
            <li><b>Anonimna statistika:</b> putanja stranice, država, jezik i dnevno rotirajući hash IP + user-agenta. Bez kolačića, bez mogućnosti identifikacije.</li>
            <li><b>Google Ads kolačići (samo uz privolu):</b> Google mjeri učinkovitost naših oglasa. Obrađuje Google Ireland Ltd.</li>
          </ul>
          <h2 className="text-xl font-bold mt-8">2. Pravna osnova</h2>
          <ul className="list-disc pl-5 space-y-1 text-sm">
            <li>Rezervacije + kontakt: čl. 6. st. 1. t. b GDPR (ugovor)</li>
            <li>Anonimna statistika: čl. 6. st. 1. t. f GDPR (legitimni interes)</li>
            <li>Google Ads: čl. 6. st. 1. t. a GDPR (privola)</li>
          </ul>
          <h2 className="text-xl font-bold mt-8">3. Izvršitelji obrade</h2>
          <ul className="list-disc pl-5 space-y-1 text-sm">
            <li>Supabase Inc., SAD (hosting baze)</li>
            <li>Vercel Inc., SAD (web hosting)</li>
            <li>Resend (transakcijski e-mail)</li>
            <li>Telegram FZ-LLC (obavijesti vlasniku, sadrži podatke rezervacije)</li>
            <li>Google Ireland Ltd. (samo uz privolu na kolačiće)</li>
          </ul>
          <h2 className="text-xl font-bold mt-8">4. Vaša prava</h2>
          <p className="text-sm">
            Imate pravo na pristup, ispravak, brisanje, ograničenje i prenosivost
            podataka. Privolu možete povući u bilo kojem trenutku putem linka
            „Postavke kolačića" u podnožju. Možete podnijeti pritužbu AZOP-u
            (www.azop.hr).
          </p>
          <h2 className="text-xl font-bold mt-8">5. Voditelj obrade</h2>
          <ContactBlock />
          <p className="text-xs text-muted mt-8">Posljednje ažuriranje: svibanj 2026.</p>
        </article>
      );

    case "it":
      return (
        <article className="prose-content space-y-6 text-ink">
          <p>
            Questo sito è gestito da {BRAND.legal} ("noi"). Prendiamo sul serio la
            protezione dei tuoi dati. Questa pagina spiega quali dati raccogliamo
            e per quali finalità.
          </p>
          <h2 className="text-xl font-bold mt-8">1. Dati trattati</h2>
          <ul className="list-disc pl-5 space-y-2 text-sm">
            <li><b>Prenotazioni:</b> nome, email, telefono, periodo di noleggio, metodo di pagamento, ricevuta. Conservati per la gestione del noleggio e gli obblighi legali (fino a 10 anni).</li>
            <li><b>Modulo di contatto:</b> nome, email, messaggio. Per risponderti.</li>
            <li><b>Statistiche anonime:</b> percorso pagina, paese, lingua e hash giornaliero di IP + user-agent. Nessun cookie, nessuna identificazione personale.</li>
            <li><b>Cookie Google Ads (solo con consenso):</b> Google misura l'efficacia degli annunci. Titolare: Google Ireland Ltd.</li>
          </ul>
          <h2 className="text-xl font-bold mt-8">2. Base giuridica</h2>
          <ul className="list-disc pl-5 space-y-1 text-sm">
            <li>Prenotazioni + contatto: art. 6(1)(b) GDPR (contratto)</li>
            <li>Statistiche anonime: art. 6(1)(f) GDPR (legittimo interesse)</li>
            <li>Google Ads: art. 6(1)(a) GDPR (consenso)</li>
          </ul>
          <h2 className="text-xl font-bold mt-8">3. Responsabili del trattamento</h2>
          <ul className="list-disc pl-5 space-y-1 text-sm">
            <li>Supabase Inc., USA (hosting database)</li>
            <li>Vercel Inc., USA (hosting web)</li>
            <li>Resend (email transazionali)</li>
            <li>Telegram FZ-LLC (notifiche al gestore, contiene dati di prenotazione)</li>
            <li>Google Ireland Ltd. (solo dopo consenso ai cookie)</li>
          </ul>
          <h2 className="text-xl font-bold mt-8">4. I tuoi diritti</h2>
          <p className="text-sm">
            Hai diritto di accesso, rettifica, cancellazione, limitazione e
            portabilità. Il consenso può essere revocato tramite il link
            „Impostazioni cookie" in fondo alla pagina. Puoi sporgere reclamo
            all'autorità competente (in Croazia: AZOP, www.azop.hr).
          </p>
          <h2 className="text-xl font-bold mt-8">5. Titolare del trattamento</h2>
          <ContactBlock />
          <p className="text-xs text-muted mt-8">Aggiornato: maggio 2026.</p>
        </article>
      );

    case "pl":
      return (
        <article className="prose-content space-y-6 text-ink">
          <p>
            Niniejszą stronę prowadzi {BRAND.legal} („my"). Poważnie traktujemy
            ochronę Twoich danych. Ta strona wyjaśnia, jakie dane przetwarzamy
            i w jakim celu.
          </p>
          <h2 className="text-xl font-bold mt-8">1. Przetwarzane dane</h2>
          <ul className="list-disc pl-5 space-y-2 text-sm">
            <li><b>Rezerwacje:</b> imię, e-mail, telefon, okres najmu, metoda płatności, potwierdzenie. Przechowywane w celu realizacji rezerwacji i spełnienia obowiązków prawnych (do 10 lat).</li>
            <li><b>Formularz kontaktowy:</b> imię, e-mail, wiadomość — w celu odpowiedzi.</li>
            <li><b>Statystyki anonimowe:</b> ścieżka strony, kraj, język i codziennie rotowany hash IP + user-agent. Bez plików cookie.</li>
            <li><b>Pliki cookie Google Ads (tylko za zgodą):</b> Google mierzy skuteczność reklam. Administrator: Google Ireland Ltd.</li>
          </ul>
          <h2 className="text-xl font-bold mt-8">2. Podstawa prawna</h2>
          <ul className="list-disc pl-5 space-y-1 text-sm">
            <li>Rezerwacje + kontakt: art. 6 ust. 1 lit. b RODO (umowa)</li>
            <li>Statystyki anonimowe: art. 6 ust. 1 lit. f RODO (uzasadniony interes)</li>
            <li>Google Ads: art. 6 ust. 1 lit. a RODO (zgoda)</li>
          </ul>
          <h2 className="text-xl font-bold mt-8">3. Procesory danych</h2>
          <ul className="list-disc pl-5 space-y-1 text-sm">
            <li>Supabase Inc., USA (hosting bazy danych)</li>
            <li>Vercel Inc., USA (hosting strony)</li>
            <li>Resend (e-mail transakcyjny)</li>
            <li>Telegram FZ-LLC (powiadomienia dla właściciela, zawiera dane rezerwacji)</li>
            <li>Google Ireland Ltd. (tylko po wyrażeniu zgody na cookies)</li>
          </ul>
          <h2 className="text-xl font-bold mt-8">4. Twoje prawa</h2>
          <p className="text-sm">
            Masz prawo do dostępu, sprostowania, usunięcia, ograniczenia
            i przenoszenia danych. Zgodę możesz wycofać w dowolnym momencie
            poprzez link „Ustawienia plików cookie" w stopce. Możesz złożyć
            skargę do organu nadzorczego (w Chorwacji: AZOP, www.azop.hr).
          </p>
          <h2 className="text-xl font-bold mt-8">5. Administrator</h2>
          <ContactBlock />
          <p className="text-xs text-muted mt-8">Ostatnia aktualizacja: maj 2026.</p>
        </article>
      );

    case "fr":
      return (
        <article className="prose-content space-y-6 text-ink">
          <p>
            Ce site est exploité par {BRAND.legal} (« nous »). Nous prenons au
            sérieux la protection de vos données. Cette page explique quelles
            données nous traitons et dans quel but.
          </p>
          <h2 className="text-xl font-bold mt-8">1. Données traitées</h2>
          <ul className="list-disc pl-5 space-y-2 text-sm">
            <li><b>Réservations :</b> nom, e-mail, téléphone, période de location, mode de paiement, justificatif. Conservés pour la gestion de la réservation et les obligations légales (jusqu'à 10 ans).</li>
            <li><b>Formulaire de contact :</b> nom, e-mail, message — pour vous répondre.</li>
            <li><b>Statistiques anonymes :</b> chemin de la page, pays, langue, hash quotidien IP + user-agent. Aucun cookie.</li>
            <li><b>Cookies Google Ads (avec consentement uniquement) :</b> Google mesure la performance de nos annonces. Responsable : Google Ireland Ltd.</li>
          </ul>
          <h2 className="text-xl font-bold mt-8">2. Base juridique</h2>
          <ul className="list-disc pl-5 space-y-1 text-sm">
            <li>Réservations + contact : art. 6(1)(b) RGPD (contrat)</li>
            <li>Statistiques anonymes : art. 6(1)(f) RGPD (intérêt légitime)</li>
            <li>Google Ads : art. 6(1)(a) RGPD (consentement)</li>
          </ul>
          <h2 className="text-xl font-bold mt-8">3. Sous-traitants</h2>
          <ul className="list-disc pl-5 space-y-1 text-sm">
            <li>Supabase Inc., USA (hébergement de la base)</li>
            <li>Vercel Inc., USA (hébergement web)</li>
            <li>Resend (e-mails transactionnels)</li>
            <li>Telegram FZ-LLC (notifications au gérant, contient les données de réservation)</li>
            <li>Google Ireland Ltd. (uniquement après consentement aux cookies)</li>
          </ul>
          <h2 className="text-xl font-bold mt-8">4. Vos droits</h2>
          <p className="text-sm">
            Vous avez le droit d'accès, de rectification, d'effacement, de
            limitation et de portabilité. Le consentement peut être retiré à tout
            moment via le lien « Paramètres des cookies » en pied de page. Vous
            pouvez introduire une réclamation auprès de l'autorité compétente
            (en Croatie : AZOP, www.azop.hr).
          </p>
          <h2 className="text-xl font-bold mt-8">5. Responsable du traitement</h2>
          <ContactBlock />
          <p className="text-xs text-muted mt-8">Dernière mise à jour : mai 2026.</p>
        </article>
      );

    case "es":
      return (
        <article className="prose-content space-y-6 text-ink">
          <p>
            Esta web es operada por {BRAND.legal} ("nosotros"). Nos tomamos en
            serio la protección de tus datos. Esta página explica qué datos
            tratamos y con qué finalidad.
          </p>
          <h2 className="text-xl font-bold mt-8">1. Datos tratados</h2>
          <ul className="list-disc pl-5 space-y-2 text-sm">
            <li><b>Reservas:</b> nombre, email, teléfono, periodo de alquiler, método de pago, comprobante. Almacenados para gestionar la reserva y cumplir obligaciones legales (hasta 10 años).</li>
            <li><b>Formulario de contacto:</b> nombre, email, mensaje — para responder.</li>
            <li><b>Estadísticas anónimas:</b> ruta de página, país, idioma y hash diario de IP + user-agent. Sin cookies.</li>
            <li><b>Cookies de Google Ads (solo con consentimiento):</b> Google mide el rendimiento de nuestros anuncios. Responsable: Google Ireland Ltd.</li>
          </ul>
          <h2 className="text-xl font-bold mt-8">2. Base jurídica</h2>
          <ul className="list-disc pl-5 space-y-1 text-sm">
            <li>Reservas + contacto: art. 6(1)(b) RGPD (contrato)</li>
            <li>Estadísticas anónimas: art. 6(1)(f) RGPD (interés legítimo)</li>
            <li>Google Ads: art. 6(1)(a) RGPD (consentimiento)</li>
          </ul>
          <h2 className="text-xl font-bold mt-8">3. Encargados del tratamiento</h2>
          <ul className="list-disc pl-5 space-y-1 text-sm">
            <li>Supabase Inc., EE.UU. (alojamiento de base de datos)</li>
            <li>Vercel Inc., EE.UU. (alojamiento web)</li>
            <li>Resend (email transaccional)</li>
            <li>Telegram FZ-LLC (notificaciones al propietario, contiene datos de reserva)</li>
            <li>Google Ireland Ltd. (solo con consentimiento de cookies)</li>
          </ul>
          <h2 className="text-xl font-bold mt-8">4. Tus derechos</h2>
          <p className="text-sm">
            Tienes derecho a acceso, rectificación, supresión, limitación y
            portabilidad. El consentimiento puede retirarse en cualquier momento
            mediante el enlace „Configuración de cookies" del pie de página.
            Puedes presentar reclamación ante la autoridad competente (en Croacia:
            AZOP, www.azop.hr).
          </p>
          <h2 className="text-xl font-bold mt-8">5. Responsable</h2>
          <ContactBlock />
          <p className="text-xs text-muted mt-8">Última actualización: mayo de 2026.</p>
        </article>
      );
  }
}

export function ImprintContent({ locale }: { locale: Locale }) {
  // Imprint is mostly the same data block in every language — only the
  // surrounding label differs. Render one block + a localised intro.
  const intro: Record<Locale, { lead: string; activity: string }> = {
    en: {
      lead: "Information according to applicable transparency requirements.",
      activity: "This site operates the scooter & motorbike rental service SickMotos · Rent a Moto in Zadar.",
    },
    de: {
      lead: "Angaben gemäß geltenden Transparenzpflichten.",
      activity: "Diese Website betreibt den Roller- und Motorradverleih SickMotos · Rent a Moto in Zadar.",
    },
    hr: {
      lead: "Podaci u skladu s primjenjivim propisima o transparentnosti.",
      activity: "Ova stranica vodi najam skutera i motocikala SickMotos · Rent a Moto u Zadru.",
    },
    it: {
      lead: "Informazioni ai sensi degli obblighi di trasparenza applicabili.",
      activity: "Questo sito gestisce il noleggio di scooter e moto SickMotos · Rent a Moto a Zara.",
    },
    pl: {
      lead: "Informacje zgodnie z obowiązującymi przepisami o transparentności.",
      activity: "Ta strona prowadzi wynajem skuterów i motocykli SickMotos · Rent a Moto w Zadarze.",
    },
    fr: {
      lead: "Informations conformément aux obligations de transparence applicables.",
      activity: "Ce site exploite la location de scooters et de motos SickMotos · Rent a Moto à Zadar.",
    },
    es: {
      lead: "Información conforme a las obligaciones de transparencia aplicables.",
      activity: "Este sitio opera el alquiler de scooters y motos SickMotos · Rent a Moto en Zadar.",
    },
    hu: {
      lead: "Tájékoztatás a vonatkozó átláthatósági kötelezettségek szerint.",
      activity: "Ez az oldal a SickMotos · Rent a Moto robogó- és motorkölcsönzőt üzemelteti Zadarban.",
    },
    sk: {
      lead: "Informácie podľa platných požiadaviek na transparentnosť.",
      activity: "Táto stránka prevádzkuje požičovňu skútrov a motoriek SickMotos · Rent a Moto v Zadare.",
    },
    cs: {
      lead: "Informace podle platných požadavků na transparentnost.",
      activity: "Tato stránka provozuje půjčovnu skútrů a motocyklů SickMotos · Rent a Moto v Zadaru.",
    },
    pt: {
      lead: "Informações de acordo com os requisitos de transparência aplicáveis.",
      activity: "Este site opera o aluguel de scooters e motos SickMotos · Rent a Moto em Zadar.",
    },
  };
  const i = intro[locale];
  return (
    <article className="prose-content space-y-6 text-ink">
      <p className="text-sm text-muted">{i.lead}</p>

      <div className="bg-sand px-5 py-5">
        <ContactBlock />
        <p className="mt-3 text-sm">
          Phone:{" "}
          <a href={`tel:+${BRAND.phoneRaw}`} className="text-red hover:underline">
            +{BRAND.phoneRaw.replace(/(\d{2})(\d{3})(\d{8})/, "$1 $2 $3")}
          </a>
        </p>
      </div>

      <p className="text-sm">{i.activity}</p>
    </article>
  );
}
