import mongoose from 'mongoose';
import { createInterface } from 'readline';
import { writeFileSync } from 'fs';
import 'dotenv/config';

// Database connection
const connectDB = async () => {
  try {
    await mongoose.connect(
      process.env.MONGODB_URI || 'mongodb://localhost:27017/trunet',
      {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      }
    );
    console.log('✅ MongoDB Connected');
  } catch (error) {
    console.error('❌ MongoDB Connection Error:', error);
    process.exit(1);
  }
};

const removeDuplicates = async () => {
  try {
    console.log('🚀 Starting duplicate removal process...\n');
    
    // Get the Product model (make sure it matches your model name)
    const Product = mongoose.model('Product', new mongoose.Schema({}), 'products');
    
    // First, backup count
    const totalProducts = await Product.countDocuments();
    console.log(`📊 Total products in database: ${totalProducts}`);
    
    // Find all duplicates
    const duplicates = await Product.aggregate([
      {
        $group: {
          _id: "$productTitle",
          ids: { $push: "$_id" },
          count: { $sum: 1 },
          docs: { 
            $push: {
              _id: "$_id",
              productCode: "$productCode",
              updatedAt: "$updatedAt",
              createdAt: "$createdAt"
            }
          }
        }
      },
      {
        $match: {
          count: { $gt: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);
    
    console.log(`\n🔍 Found ${duplicates.length} duplicate product titles\n`);
    
    if (duplicates.length === 0) {
      console.log('🎉 No duplicates found!');
      process.exit(0);
    }
    
    // Display duplicates
    duplicates.forEach((dup, index) => {
      console.log(`${index + 1}. "${dup._id}" - ${dup.count} duplicates`);
      dup.docs.forEach(doc => {
        const date = new Date(doc.updatedAt);
        console.log(`   📌 ID: ${doc._id}, Code: ${doc.productCode || 'N/A'}, Updated: ${date.toLocaleDateString()}`);
      });
      console.log('');
    });
    
    const totalToDelete = duplicates.reduce((sum, dup) => sum + (dup.count - 1), 0);
    console.log(`📈 Total individual duplicates to remove: ${totalToDelete}\n`);
    
    // Ask for confirmation
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    rl.question(`⚠️  Do you want to remove duplicates? (yes/no): `, async (answer) => {
      if (answer.toLowerCase() !== 'yes') {
        console.log('❌ Operation cancelled.');
        rl.close();
        mongoose.connection.close();
        process.exit(0);
      }
      
      let totalDeleted = 0;
      const keptProducts = [];
      const deletedProducts = [];
      
      console.log('\n🔄 Removing duplicates...\n');
      
      // Process each duplicate group
      for (const dup of duplicates) {
        // Sort by updatedAt (most recent first)
        dup.docs.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        
        // Keep the most recent one
        const productToKeep = dup.docs[0];
        const productsToDelete = dup.docs.slice(1);
        
        // Delete duplicates
        const deleteIds = productsToDelete.map(p => p._id);
        
        if (deleteIds.length > 0) {
          const result = await Product.deleteMany({ _id: { $in: deleteIds } });
          totalDeleted += result.deletedCount;
          
          keptProducts.push({
            title: dup._id,
            keptId: productToKeep._id,
            keptCode: productToKeep.productCode,
            keptUpdated: productToKeep.updatedAt
          });
          
          productsToDelete.forEach(p => {
            deletedProducts.push({
              title: dup._id,
              id: p._id,
              code: p.productCode,
              updatedAt: p.updatedAt
            });
          });
          
          console.log(`✅ Removed ${result.deletedCount} duplicates for "${dup._id}"`);
        }
      }
      
      // Create backup file
      const backupData = {
        timestamp: new Date().toISOString(),
        totalProductsBefore: totalProducts,
        totalDeleted: totalDeleted,
        keptProducts: keptProducts,
        deletedProducts: deletedProducts
      };
      
      const backupFileName = `duplicate_backup_${Date.now()}.json`;
      writeFileSync(
        backupFileName,
        JSON.stringify(backupData, null, 2)
      );
      
      console.log(`\n🎉 Done!`);
      console.log(`✅ Total duplicates removed: ${totalDeleted}`);
      console.log(`📊 Remaining products: ${totalProducts - totalDeleted}`);
      console.log(`💾 Backup saved to: ${backupFileName}`);
      
      // Verify
      const remainingDuplicates = await Product.aggregate([
        {
          $group: {
            _id: "$productTitle",
            count: { $sum: 1 }
          }
        },
        {
          $match: {
            count: { $gt: 1 }
          }
        }
      ]);
      
      if (remainingDuplicates.length === 0) {
        console.log('✅ All duplicates have been removed!');
      } else {
        console.log(`⚠️  Warning: Still found ${remainingDuplicates.length} duplicate titles`);
      }
      
      rl.close();
      mongoose.connection.close();
      console.log('\n👋 Connection closed. Process complete!');
      process.exit(0);
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    mongoose.connection.close();
    process.exit(1);
  }
};

// Run the script
(async () => {
  await connectDB();
  await removeDuplicates();
})();