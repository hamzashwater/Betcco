// Browser/component mocks prove UI contracts only, never provider settlement.
export const purchaseCart = {
  id: "raw-cart-17",
  items: [
    {
      id: "raw-item-17",
      referenceId: "raw-reference-17",
      itemType: "Course",
      title: "RAW Course دورة",
      price: 10.125,
    },
  ],
  subtotal: 10.125,
  discount: 2.005,
  total: 8.12,
  currency: "JOD",
};
export const purchasePayment = {
  paymentId: "raw-payment-17",
  status: "Pending",
  provider: "FakeCard",
  checkoutReference: "raw-checkout-17",
  redirectUrl: null,
  subtotal: 10.125,
  discount: 2.005,
  tax: 0.015,
  total: 8.135,
  currency: "JOD",
  paymentMethod: "Card",
};
export const purchaseMembership = {
  id: "raw-membership-17",
  title: "RAW Membership عضوية",
  description: "RAW membership description وصف",
  features: ["RAW benefit ميزة"],
  price: 15.125,
  currency: "JOD",
  interval: "Monthly",
  courses: [{ title: "RAW included course دورة" }],
};
export const purchaseSubscription = {
  id: "raw-subscription-17",
  title: "RAW Subscription اشتراك",
  courseTitle: "RAW subscription course دورة",
  price: 7.125,
  currency: "JOD",
  interval: "Quarterly",
};
export const purchasePackage = {
  id: "raw-package-id-17",
  slug: "raw-package-slug-17",
  title: "RAW Package حزمة",
  description: "RAW package description وصف",
  price: 17.125,
  currency: "JOD",
  originalPrice: 20.125,
  discountAmount: 3,
  courses: [{ slug: "raw-package-course", title: "RAW Package Course دورة" }],
};
