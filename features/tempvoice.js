const {
  Events, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits, Routes,
  StringSelectMenuBuilder, EmbedBuilder,
} = require('discord.js');

const HUB_NAME = 'General VC';
const TEMP_SUFFIX = "'s VC";

const hubs = new Map();         // guildId -> hub channel id
const tempChannels = new Set(); // temp channel ids
const owners = new Map();       // temp channel id -> owner user id

function panelRow(locked) {
  // Discord caps an action row at 5 components, so the panel is two rows
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('vc:rename').setLabel('Rename').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('vc:limit').setLabel('User limit').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('vc:lock').setLabel(locked ? 'Unlock' : 'Lock').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('vc:status').setLabel('Status').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('vc:kick').setLabel('Kick user').setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('vc:delete').setLabel('Delete VC').setStyle(ButtonStyle.Danger),
    ),
  ];
}

function panelPayload(ownerId, locked) {
  const embed = new EmbedBuilder()
    .setColor(0x6b0f1a)
    .setTitle('Your VC Controls')
    .setDescription(
      `<@${ownerId}>, this room is yours.\n\n` +
      '**Rename**\n╰─ Change the channel name\n\n' +
      '**User limit**\n╰─ Cap how many can join\n\n' +
      '**Lock**\n╰─ Only people you allow can connect\n\n' +
      '**Status**\n╰─ Text under the channel name\n\n' +
      '**Kick user**\n╰─ Move someone out to the hub\n\n' +
      '**Delete VC**\n╰─ Remove the room entirely',
    );
  return { content: '', embeds: [embed], components: panelRow(locked) };
}

function isLocked(ch) {
  const everyone = ch.permissionOverwrites.cache.get(ch.guild.roles.everyone.id);
  return !!everyone?.deny.has(PermissionFlagsBits.Connect);
}

function claimRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('vc:claim').setLabel('Claim VC').setStyle(ButtonStyle.Success),
  );
}

module.exports = (client) => {
  client.once('clientReady', async () => {
    for (const guild of client.guilds.cache.values()) {
      try {
        let hub = guild.channels.cache.find(c => c.name === HUB_NAME);
        if (!hub) {
          hub = await guild.channels.create({ name: HUB_NAME, type: ChannelType.GuildVoice });
        }
        hubs.set(guild.id, hub.id);
        // Clean up temp channels left over from before a restart (delete empty ones, re-track the rest)
        for (const c of guild.channels.cache.values()) {
          if (!c.name.endsWith(TEMP_SUFFIX)) continue;
          if (c.members.size === 0) await c.delete();
          else {
            tempChannels.add(c.id);
            // Remove stale panel messages from before the restart, then ask for a claim
            const msgs = await c.messages.fetch({ limit: 20 }).catch(() => null);
            if (msgs) {
              for (const m of msgs.values()) {
                if (m.author.id === client.user.id) await m.delete().catch(() => {});
              }
            }
            await c.send({ content: 'This VC lost its owner in a restart — claim it:', components: [claimRow()] });
          }
        }
      } catch (err) {
        console.error(`tempvoice setup failed in ${guild.name} (needs Manage Channels + Connect perms):`, err.message);
      }
    }
  });

  client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    try {
      const hubId = hubs.get(newState.guild.id);

      // Joined the hub -> create a temp VC and move them in
      if (hubId && newState.channelId === hubId && newState.member) {
        const ch = await newState.guild.channels.create({
          name: `${newState.member.displayName}${TEMP_SUFFIX}`,
          type: ChannelType.GuildVoice,
        });
        tempChannels.add(ch.id);
        owners.set(ch.id, newState.member.id);
        await newState.member.voice.setChannel(ch);
        await ch.send(panelPayload(newState.member.id, false));
        return;
      }

      // A temp VC just became empty -> delete it
      if (oldState.channelId && tempChannels.has(oldState.channelId)) {
        const ch = oldState.guild.channels.cache.get(oldState.channelId);
        if (ch && ch.members.size === 0) {
          tempChannels.delete(ch.id);
          owners.delete(ch.id);
          await ch.delete();
        }
      }
    } catch (err) {
      console.error('tempvoice error:', err);
    }
  });

  client.on(Events.ChannelDelete, (ch) => {
    tempChannels.delete(ch.id);
    owners.delete(ch.id);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (!interaction.isButton() && !interaction.isModalSubmit() && !interaction.isStringSelectMenu()) return;
      if (!interaction.customId?.startsWith('vc:')) return;

      // Ownerless (restarted) temp VC: first press of Claim adopts it
      if (interaction.customId === 'vc:claim') {
        if (!tempChannels.has(interaction.channelId)) return;
        if (owners.has(interaction.channelId)) {
          await interaction.reply({ content: 'This VC is already claimed.', ephemeral: true });
          return;
        }
        owners.set(interaction.channelId, interaction.user.id);
        await interaction.update(panelPayload(interaction.user.id, isLocked(interaction.channel)));
        return;
      }

      const ownerId = owners.get(interaction.channelId);
      const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
      if (!ownerId || (interaction.user.id !== ownerId && !isAdmin)) {
        if (interaction.isButton()) {
          await interaction.reply({ content: 'Only the VC owner or an admin can use this panel.', ephemeral: true });
        }
        return;
      }

      const ch = interaction.channel;
      const action = interaction.customId.slice(3);

      if (interaction.isButton()) {
        if (action === 'kick') {
          const others = [...ch.members.values()].filter(m => m.id !== ownerId).slice(0, 25);
          if (!others.length) {
            await interaction.reply({ content: 'Nobody else is in your VC.', ephemeral: true });
            return;
          }
          const menu = new StringSelectMenuBuilder().setCustomId('vc:kickselect').setPlaceholder('Who gets kicked?')
            .addOptions(others.map(m => ({ label: m.displayName, value: m.id })));
          await interaction.reply({
            content: 'Pick someone to kick:',
            components: [new ActionRowBuilder().addComponents(menu)],
            ephemeral: true,
          });
          return;
        }
        if (action === 'rename') {
          await interaction.showModal(new ModalBuilder()
            .setCustomId('vc:rename').setTitle('Rename VC')
            .addComponents(new TextInputBuilder()
              .setCustomId('name').setLabel('Channel name')
              .setStyle(TextInputStyle.Short).setMaxLength(100).setValue(ch.name)));
          return;
        }
        if (action === 'limit') {
          await interaction.showModal(new ModalBuilder()
            .setCustomId('vc:limit').setTitle('User limit')
            .addComponents(new TextInputBuilder()
              .setCustomId('limit').setLabel('Max users (0 = unlimited)')
              .setStyle(TextInputStyle.Short).setMaxLength(2)
              .setValue(String(ch.userLimit || 0))));
          return;
        }
        if (action === 'status') {
          await interaction.showModal(new ModalBuilder()
            .setCustomId('vc:status').setTitle('VC status')
            .addComponents(new TextInputBuilder()
              .setCustomId('status').setLabel('Text under the channel name (empty = clear)')
              .setStyle(TextInputStyle.Paragraph).setMaxLength(500).setRequired(false)));
          return;
        }
        if (action === 'lock') {
          const locked = isLocked(ch);
          // null resets the overwrite instead of setting it
          await ch.permissionOverwrites.edit(ch.guild.roles.everyone, { Connect: locked ? null : false });
          await interaction.update({ content: `<@${ownerId}> your VC controls:`, components: [panelRow(!locked)] });
          return;
        }
        if (action === 'delete') {
          tempChannels.delete(ch.id);
          owners.delete(ch.id);
          await ch.delete();
          return;
        }
        return;
      }

      // Select menu: owner picked someone to kick
      if (interaction.isStringSelectMenu()) {
        const target = interaction.guild?.members.cache.get(interaction.values[0]);
        if (target && target.voice.channelId === interaction.channelId) {
          const hub = ch.guild.channels.cache.get(hubs.get(ch.guild.id));
          if (hub) await target.voice.setChannel(hub);
        }
        await interaction.update(panelPayload(ownerId, isLocked(ch)));
        return;
      }

      // Modal submits
      if (action === 'rename') {
        const name = interaction.fields.getTextInputValue('name').trim();
        await ch.setName(name);
        await interaction.reply({ content: `Renamed to **${name}**.`, ephemeral: true });
      } else if (action === 'status') {
        const status = interaction.fields.getTextInputValue('status').trim();
        // setStatus() doesn't exist in discord.js 14.27 — call the endpoint directly
        await interaction.client.rest.put(Routes.channelVoiceStatus(ch.id), { body: { status: status || null } });
        await interaction.reply({ content: status ? `Status set to: **${status}**` : 'Status cleared.', ephemeral: true });
      } else if (action === 'limit') {
        const n = parseInt(interaction.fields.getTextInputValue('limit'), 10);
        if (Number.isNaN(n) || n < 0 || n > 99) {
          await interaction.reply({ content: 'Enter a number between 0 and 99.', ephemeral: true });
          return;
        }
        await ch.setUserLimit(n);
        await interaction.reply({ content: n ? `User limit set to **${n}**.` : 'User limit removed.', ephemeral: true });
      }
    } catch (err) {
      console.error('vc panel error:', err);
      if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: 'Something went wrong.', ephemeral: true }).catch(() => {});
      }
    }
  });
};