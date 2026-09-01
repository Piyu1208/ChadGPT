"use server";

import { prisma } from '@/lib/db';
import { requireUser } from '@/features/auth/action/require-user';

export async function startNewChat() {
    const user  = await requireUser();

    const conversation = await prisma.conversation.create({
        data: {
            userId: user.id,
            title: "New Chat"
        }
    });

    return conversation.id;
}