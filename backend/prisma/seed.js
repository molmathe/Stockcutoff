const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const hq = await prisma.branch.upsert({
    where: { code: 'HQ' },
    update: {},
    create: { name: 'Head Quarter', code: 'HQ', address: '123 Main St', phone: '555-0001' },
  });
  const branch2 = await prisma.branch.upsert({
    where: { code: 'BR01' },
    update: {},
    create: { name: 'Branch 01', code: 'BR01', address: '456 Second Ave', phone: '555-0002' },
  });

  await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: { username: 'admin', password: await bcrypt.hash('admin123', 10), name: 'Super Admin', role: 'SUPER_ADMIN' },
  });
  await prisma.user.upsert({
    where: { username: 'branch_admin' },
    update: {},
    create: { username: 'branch_admin', password: await bcrypt.hash('branch123', 10), name: 'Branch Manager', role: 'BRANCH_ADMIN', branchId: hq.id },
  });
  await prisma.user.upsert({
    where: { username: 'cashier1' },
    update: {},
    create: { username: 'cashier1', password: await bcrypt.hash('cashier123', 10), name: 'Cashier One', role: 'CASHIER', branchId: hq.id },
  });
  await prisma.user.upsert({
    where: { username: 'cashier2' },
    update: {},
    create: { username: 'cashier2', password: await bcrypt.hash('cashier123', 10), name: 'Cashier Two', role: 'CASHIER', branchId: branch2.id },
  });

  const items = [
    { sku: 'ELEC001', barcode: '8850006510012', name: 'USB Charger 20W', description: 'Fast charging USB-C', defaultPrice: 299.00, category: 'Electronics' },
    { sku: 'ELEC002', barcode: '8850006510029', name: 'Earphones Pro', description: 'Noise cancelling', defaultPrice: 599.00, category: 'Electronics' },
    { sku: 'FOOD001', barcode: '8850006520011', name: 'Green Tea 500ml', description: 'Refreshing green tea', defaultPrice: 25.00, category: 'Beverages' },
    { sku: 'FOOD002', barcode: '8850006520028', name: 'Mineral Water 1L', description: 'Pure drinking water', defaultPrice: 15.00, category: 'Beverages' },
    { sku: 'CLOTH001', barcode: '8850006530010', name: 'Cotton T-Shirt M', description: 'Premium cotton', defaultPrice: 199.00, category: 'Clothing' },
    { sku: 'CLOTH002', barcode: '8850006530027', name: 'Denim Jeans 32', description: 'Classic blue denim', defaultPrice: 799.00, category: 'Clothing' },
    { sku: 'SNACK001', barcode: '8850006540018', name: 'Potato Chips 100g', description: 'Crispy salted', defaultPrice: 35.00, category: 'Snacks' },
    { sku: 'SNACK002', barcode: '8850006540025', name: 'Chocolate Bar', description: 'Dark chocolate 70%', defaultPrice: 45.00, category: 'Snacks' },
  ];
  for (const item of items) {
    await prisma.item.upsert({ where: { sku: item.sku }, update: {}, create: item });
  }

  console.log('✅ Seed complete!');
  console.log('   Super Admin:   admin / admin123');
  console.log('   Branch Admin:  branch_admin / branch123');
  console.log('   Cashier HQ:    cashier1 / cashier123');
  console.log('   Cashier BR01:  cashier2 / cashier123');
}

main().catch(console.error).finally(() => prisma.$disconnect());
