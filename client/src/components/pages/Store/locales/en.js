import cartEn from "../Cart/locales/en";
import ordersEn from "../Orders/locales/en";
import productsEn from "../Products/locales/en";
import reportsEn from "../Reports/locales/en";
import settingsEn from "../Settings/locales/en";
import usersEn from "../Users/locales/en";
import walletEn from "../Wallet/locales/en";

const storeEn = {
  navbar: {
    users: "Users",
    roles: "Roles",
    products: "Products",
    checkout: "Checkout",
    wallet: "Wallet",
    settings: "Settings",
    logout: "Log Out",
    menu: "Menu",
    cart: "Sale",
    orders: "Orders",
    reports: "Reports",
  },
  seedTour: {
    title: "Protect your SEED Phrase!",
    description: "Your SEED Phrase is the <b>master key</b> to your Bitcoin wallet. If you lose access to the app, it's the only way to recover your funds.",
    clickSettings: "Go to Settings to view and back up your SEED Phrase.",
    nextButton: "Go to Settings",
    mobileGoToSettings: "Go to Settings",
    settingsTitle: "Back up your SEED Phrase",
    settingsDescription: "Write down all <b>12 words in order</b> on paper and store them somewhere safe — offline.",
    settingsButton: "Got it",
  },
  walletTour: {
    title: "Before you start!",
    description: "To receive <b>Bitcoin payments</b> you need to open a <b>Lightning channel</b>.",
    clickWallet: "Click on Wallet to get started.",
    mobileGoToWallet: "Go to Wallet",
    nextButton: "Go to Wallet",
    guardTitle: "Wallet Access",
    guardDescription: "This password protects your Bitcoin wallet. Enter it to access your Lightning channels.",
    guardButton: "Got it",
    receiveAmountTitle: "Step 1: Amount in satoshis",
    receiveAmountDescription: "Enter <b>5000</b> as the amount. This covers the fee to open your Lightning channel.",
    receiveDescTitle: "Step 2: Description",
    receiveDescDescription: "Type <b>open channel</b> as the description to identify this payment.",
    receiveButtonTitle: "Step 3: Create & Scan",
    receiveButtonDescription: "Click <b>Create Lightning Invoice</b>, then scan the QR code that appears with your Lightning wallet to open the channel.",
    receiveButton: "Got it",
  },
  dashboard: {
    title: "Dashboard",
    subtitle: "Welcome to your store management dashboard",
    stats: {
      users: "Users",
      products: "Products",
      sales: "Sales",
    },
  },
  ...usersEn,
  ...productsEn,
  ...cartEn,
  ...walletEn,
  ...ordersEn,
  ...reportsEn,
  ...settingsEn,

};

export default storeEn;
