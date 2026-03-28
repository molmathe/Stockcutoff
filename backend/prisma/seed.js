const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  // Seed categories first
  const categoryNames = ['อิเล็กทรอนิกส์', 'เครื่องดื่ม', 'เสื้อผ้า', 'ขนม', 'เครื่องใช้ทั่วไป'];
  for (const name of categoryNames) {
    await prisma.category.upsert({ where: { name }, update: {}, create: { name } });
  }
  console.log('✅ Categories seeded');

  // Branches with pincodes
  const hq = await prisma.branch.upsert({
    where: { code: 'HQ' },
    update: {},
    create: { name: 'สำนักงานใหญ่', code: 'HQ', address: '123 ถนนสุขุมวิท', phone: '02-555-0001', pincode: '1234' },
  });
  const branch2 = await prisma.branch.upsert({
    where: { code: 'BR01' },
    update: {},
    create: { name: 'สาขา 01', code: 'BR01', address: '456 ถนนพระราม 4', phone: '02-555-0002', pincode: '5678' },
  });
  console.log('✅ Branches seeded (HQ PIN: 1234, BR01 PIN: 5678)');

  // Admin users
  await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: { username: 'admin', password: await bcrypt.hash('admin123', 10), name: 'ผู้ดูแลระบบ', role: 'SUPER_ADMIN' },
  });
  await prisma.user.upsert({
    where: { username: 'branch_admin' },
    update: {},
    create: { username: 'branch_admin', password: await bcrypt.hash('branch123', 10), name: 'ผู้จัดการสาขา', role: 'BRANCH_ADMIN', branchId: hq.id },
  });
  await prisma.user.upsert({
    where: { username: 'cashier1' },
    update: {},
    create: { username: 'cashier1', password: await bcrypt.hash('cashier123', 10), name: 'แคชเชียร์ 1', role: 'CASHIER', branchId: hq.id },
  });
  await prisma.user.upsert({
    where: { username: 'cashier2' },
    update: {},
    create: { username: 'cashier2', password: await bcrypt.hash('cashier123', 10), name: 'แคชเชียร์ 2', role: 'CASHIER', branchId: branch2.id },
  });
  // POS system users for pincode login
  await prisma.user.upsert({
    where: { username: 'pos_hq' },
    update: {},
    create: { username: 'pos_hq', password: await bcrypt.hash('1234', 10), name: 'POS สำนักงานใหญ่', role: 'CASHIER', branchId: hq.id, isSystem: true },
  });
  await prisma.user.upsert({
    where: { username: 'pos_br01' },
    update: {},
    create: { username: 'pos_br01', password: await bcrypt.hash('5678', 10), name: 'POS สาขา 01', role: 'CASHIER', branchId: branch2.id, isSystem: true },
  });
  console.log('✅ Users seeded');

  // Items (Thai names)
  const items = [
    { sku: 'ELEC001', barcode: '8850006510012', name: 'ที่ชาร์จ USB 20W', description: 'ชาร์จเร็ว USB-C', defaultPrice: 299.00, category: 'อิเล็กทรอนิกส์' },
    { sku: 'ELEC002', barcode: '8850006510029', name: 'หูฟัง Pro', description: 'ตัดเสียงรบกวน', defaultPrice: 599.00, category: 'อิเล็กทรอนิกส์' },
    { sku: 'FOOD001', barcode: '8850006520011', name: 'ชาเขียว 500มล.', description: 'ชาเขียวสดชื่น', defaultPrice: 25.00, category: 'เครื่องดื่ม' },
    { sku: 'FOOD002', barcode: '8850006520028', name: 'น้ำดื่ม 1ลิตร', description: 'น้ำดื่มบริสุทธิ์', defaultPrice: 15.00, category: 'เครื่องดื่ม' },
    { sku: 'CLOTH001', barcode: '8850006530010', name: 'เสื้อยืด Cotton M', description: 'คอตตอนแท้', defaultPrice: 199.00, category: 'เสื้อผ้า' },
    { sku: 'CLOTH002', barcode: '8850006530027', name: 'กางเกงยีนส์ 32', description: 'ยีนส์คลาสสิก', defaultPrice: 799.00, category: 'เสื้อผ้า' },
    { sku: 'SNACK001', barcode: '8850006540018', name: 'มันฝรั่งทอด 100ก.', description: 'กรอบเค็ม', defaultPrice: 35.00, category: 'ขนม' },
    { sku: 'SNACK002', barcode: '8850006540025', name: 'ช็อกโกแลตแท่ง', description: 'ดาร์กช็อกโกแลต 70%', defaultPrice: 45.00, category: 'ขนม' },
  ];
  for (const item of items) {
    await prisma.item.upsert({
      where: { barcode: item.barcode },
      update: item,
      create: item,
    });
  }
  console.log('✅ Items seeded');

  console.log('\n🎉 Seed สำเร็จ!');
  console.log('   Super Admin:    admin / admin123');
  console.log('   Branch Admin:   branch_admin / branch123');
  console.log('   Cashier HQ:     cashier1 / cashier123');
  console.log('   Cashier BR01:   cashier2 / cashier123');
  console.log('   POS HQ PIN:     1234');
  console.log('   POS BR01 PIN:   5678');
}

main().catch(console.error).finally(() => prisma.$disconnect());
