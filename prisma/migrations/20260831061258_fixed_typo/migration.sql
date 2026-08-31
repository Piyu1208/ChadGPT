/*
  Warnings:

  - You are about to drop the column `imageURl` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "User" DROP COLUMN "imageURl",
ADD COLUMN     "imageUrl" TEXT;
