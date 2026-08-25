export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: 'INR';
  category: string;
  upsellCandidates: string[];
}

const products: Product[] = [
  {
    id: 'desk-lamp-led',
    name: 'Focus LED Desk Lamp',
    description: 'Adjustable, low-glare desk lamp with three color temperatures for long study sessions.',
    price: 1499,
    currency: 'INR',
    category: 'developer-workspace',
    upsellCandidates: ['cable-organizer-kit', 'desk-mat-xl'],
  },
  {
    id: 'laptop-stand-aluminum',
    name: 'Aluminum Laptop Stand',
    description: 'Foldable aluminum stand that raises a laptop for a more comfortable working posture.',
    price: 2299,
    currency: 'INR',
    category: 'developer-workspace',
    upsellCandidates: ['wireless-keyboard', 'ergonomic-mouse'],
  },
  {
    id: 'wireless-keyboard',
    name: 'Compact Wireless Keyboard',
    description: 'Quiet, rechargeable keyboard with a compact layout for small desks and shared spaces.',
    price: 1899,
    currency: 'INR',
    category: 'developer-workspace',
    upsellCandidates: ['ergonomic-mouse', 'laptop-stand-aluminum'],
  },
  {
    id: 'ergonomic-mouse',
    name: 'Ergonomic Wireless Mouse',
    description: 'Comfort-focused wireless mouse with adjustable sensitivity and silent clicks.',
    price: 1299,
    currency: 'INR',
    category: 'developer-workspace',
    upsellCandidates: ['wireless-keyboard', 'desk-mat-xl'],
  },
  {
    id: 'desk-mat-xl',
    name: 'XL Recycled Desk Mat',
    description: 'Water-resistant recycled-fabric mat that protects a desk and keeps peripherals steady.',
    price: 899,
    currency: 'INR',
    category: 'developer-workspace',
    upsellCandidates: ['ergonomic-mouse', 'cable-organizer-kit'],
  },
  {
    id: 'cable-organizer-kit',
    name: 'Cable Organizer Kit',
    description: 'Reusable clips, sleeves, and ties for keeping a laptop and monitor setup tidy.',
    price: 499,
    currency: 'INR',
    category: 'developer-workspace',
    upsellCandidates: ['desk-mat-xl', 'usb-c-hub'],
  },
  {
    id: 'usb-c-hub',
    name: '7-in-1 USB-C Hub',
    description: 'Portable hub with HDMI, USB-A, SD card, and power delivery passthrough.',
    price: 2499,
    currency: 'INR',
    category: 'developer-workspace',
    upsellCandidates: ['laptop-stand-aluminum', 'webcam-1080p'],
  },
  {
    id: 'webcam-1080p',
    name: '1080p Study Webcam',
    description: 'Plug-and-play webcam with a privacy shutter for classes, interviews, and stand-ups.',
    price: 2799,
    currency: 'INR',
    category: 'developer-workspace',
    upsellCandidates: ['usb-c-hub', 'desk-lamp-led'],
  },
  {
    id: 'noise-cancel-headphones',
    name: 'Focus Noise-Canceling Headphones',
    description: 'Over-ear headphones with active noise cancellation and a wired backup mode.',
    price: 3999,
    currency: 'INR',
    category: 'developer-workspace',
    upsellCandidates: ['desk-lamp-led', 'laptop-stand-aluminum'],
  },
  {
    id: 'mechanical-keyboard',
    name: 'Tenkeyless Mechanical Keyboard',
    description: 'Compact mechanical keyboard with hot-swappable switches and white backlighting.',
    price: 4499,
    currency: 'INR',
    category: 'developer-workspace',
    upsellCandidates: ['ergonomic-mouse', 'desk-mat-xl'],
  },
  {
    id: 'monitor-arm-single',
    name: 'Single Monitor Arm',
    description: 'Gas-spring monitor arm with height, tilt, and rotation adjustment for a clean desk.',
    price: 3299,
    currency: 'INR',
    category: 'developer-workspace',
    upsellCandidates: ['cable-organizer-kit', 'desk-lamp-led'],
  },
  {
    id: 'portable-ssd-1tb',
    name: '1TB Portable SSD',
    description: 'Fast USB-C solid-state drive for project backups, datasets, and development environments.',
    price: 6499,
    currency: 'INR',
    category: 'developer-workspace',
    upsellCandidates: ['usb-c-hub', 'cable-organizer-kit'],
  },
  {
    id: 'surge-protector-6way',
    name: '6-Way Surge Protector',
    description: 'Six-outlet power strip with overload protection and two USB charging ports.',
    price: 1199,
    currency: 'INR',
    category: 'developer-workspace',
    upsellCandidates: ['cable-organizer-kit', 'desk-lamp-led'],
  },
  {
    id: 'whiteboard-mini',
    name: 'Mini Planning Whiteboard',
    description: 'Desktop magnetic whiteboard for sprint notes, study plans, and quick diagrams.',
    price: 799,
    currency: 'INR',
    category: 'developer-workspace',
    upsellCandidates: ['marker-set', 'desk-lamp-led'],
  },
  {
    id: 'marker-set',
    name: 'Low-Odor Marker Set',
    description: 'Eight low-odor dry-erase markers with fine tips for compact planning boards.',
    price: 299,
    currency: 'INR',
    category: 'developer-workspace',
    upsellCandidates: ['whiteboard-mini', 'desk-mat-xl'],
  },
  {
    id: 'laptop-sleeve-15',
    name: '15-inch Recycled Laptop Sleeve',
    description: 'Padded water-resistant sleeve with a charger pocket for daily commuting.',
    price: 1099,
    currency: 'INR',
    category: 'developer-workspace',
    upsellCandidates: ['cable-organizer-kit', 'usb-c-hub'],
  },
  {
    id: 'usb-c-charger-65w',
    name: '65W USB-C GaN Charger',
    description: 'Compact fast charger with two USB-C ports for laptops, phones, and tablets.',
    price: 2999,
    currency: 'INR',
    category: 'developer-workspace',
    upsellCandidates: ['usb-c-hub', 'laptop-sleeve-15'],
  },
  {
    id: 'footrest-adjustable',
    name: 'Adjustable Desk Footrest',
    description: 'Textured under-desk footrest with two height angles for more comfortable sitting.',
    price: 1599,
    currency: 'INR',
    category: 'developer-workspace',
    upsellCandidates: ['desk-lamp-led', 'laptop-stand-aluminum'],
  },
  {
    id: 'notebook-dot-grid',
    name: 'Dot-Grid Project Notebook',
    description: 'Hardcover dot-grid notebook for architecture sketches, checklists, and meeting notes.',
    price: 449,
    currency: 'INR',
    category: 'developer-workspace',
    upsellCandidates: ['marker-set', 'whiteboard-mini'],
  },
  {
    id: 'monitor-light-bar',
    name: 'Monitor Light Bar',
    description: 'Screen-mounted light bar that illuminates the desk without adding screen glare.',
    price: 2699,
    currency: 'INR',
    category: 'developer-workspace',
    upsellCandidates: ['desk-lamp-led', 'cable-organizer-kit'],
  },
];

const catalog = new Map(products.map((product) => [product.id, product]));

export function listProducts(): Product[] {
  return products.map((product) => ({
    ...product,
    upsellCandidates: [...product.upsellCandidates],
  }));
}

export function getProduct(productId: string): Product | undefined {
  const product = catalog.get(productId);
  return product
    ? { ...product, upsellCandidates: [...product.upsellCandidates] }
    : undefined;
}

export function getUpsellCandidates(productId: string): Product[] {
  const product = catalog.get(productId);
  if (!product) return [];

  return product.upsellCandidates
    .map((candidateId) => catalog.get(candidateId))
    .filter((candidate): candidate is Product => candidate !== undefined)
    .map((candidate) => ({
      ...candidate,
      upsellCandidates: [...candidate.upsellCandidates],
    }));
}

export function hasProduct(productId: string): boolean {
  return catalog.has(productId);
}
