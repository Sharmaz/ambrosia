import cartEs from "../Cart/locales/es";
import ordersEs from "../Orders/locales/es";
import productsEs from "../Products/locales/es";
import reportsEs from "../Reports/locales/es";
import settingsEs from "../Settings/locales/es";
import usersEs from "../Users/locales/es";
import walletEs from "../Wallet/locales/es";

const storeEs = {
  navbar: {
    users: "Usuarios",
    roles: "Roles",
    products: "Productos",
    checkout: "Caja",
    wallet: "Billetera",
    settings: "Configuración",
    logout: "Cerrar sesión",
    menu: "Menú",
    cart: "Venta",
    orders: "Ordenes",
    reports: "Reportes",
  },
  seedTour: {
    title: "¡Protege tu SEED Phrase!",
    description: "Tu SEED Phrase es la <b>clave maestra</b> de tu wallet Bitcoin. Si pierdes acceso a la app, es la única forma de recuperar tus fondos.",
    clickSettings: "Ve a Configuración para ver y respaldar tu SEED Phrase.",
    nextButton: "Ir a Configuración",
    mobileGoToSettings: "Ir a Configuración",
    settingsTitle: "Respalda tu SEED Phrase",
    settingsDescription: "Escribe las <b>12 palabras en orden</b> en papel y guárdalas en un lugar seguro — sin conexión a internet.",
    settingsButton: "Entendido",
  },
  walletTour: {
    title: "¡Antes de comenzar!",
    description: "Para recibir <b>pagos con Bitcoin</b> necesitas abrir un <b>canal Lightning</b>.",
    clickWallet: "Haz click en Billetera para comenzar.",
    mobileGoToWallet: "Ir a Billetera",
    nextButton: "Ir a Billetera",
    guardTitle: "Acceso a la Billetera",
    guardDescription: "Esta contraseña protege tu billetera Bitcoin. Ingrésala para acceder a tus canales Lightning.",
    guardButton: "Entendido",
    receiveAmountTitle: "Paso 1: Monto en satoshis",
    receiveAmountDescription: "Ingresa <b>5000</b> como monto. Esta cantidad cubre la comisión para abrir tu canal Lightning.",
    receiveDescTitle: "Paso 2: Descripción",
    receiveDescDescription: "Escribe <b>open channel</b> como descripción para identificar este pago.",
    receiveButtonTitle: "Paso 3: Crear y escanear",
    receiveButtonDescription: "Haz click en <b>Crear Invoice Lightning</b>, luego escanea el QR que aparece con tu wallet Lightning para abrir el canal.",
    receiveButton: "Entendido",
  },
  dashboard: {
    title: "Panel de control",
    subtitle: "Bienvenido al panel de administración de tu tienda",
    stats: {
      users: "Usuarios",
      products: "Productos",
      sales: "Ventas",
    },
  },
  ...usersEs,
  ...productsEs,
  ...cartEs,
  ...walletEs,
  ...ordersEs,
  ...reportsEs,
  ...settingsEs,

};

export default storeEs;
