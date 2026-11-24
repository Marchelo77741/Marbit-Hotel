import { BusinessCard } from './settings/BusinessCard'
import { ClientRemindersCard } from './settings/ClientRemindersCard'
import { DataBackupCard } from './settings/DataBackupCard'
import { QuoterCard } from './settings/QuoterCard'
import { RemindersCard } from './settings/RemindersCard'
import { RemoteBackupCard } from './settings/RemoteBackupCard'
import { RoomsCard } from './settings/RoomsCard'
import { TeamCard } from './settings/TeamCard'
import { SiteCard } from './settings/SiteCard'

export default function SettingsView() {
  return (
    <div className="stack">
      <TeamCard />
      <RemindersCard />
      <ClientRemindersCard />
      <RoomsCard />
      <SiteCard />
      <BusinessCard />
      <QuoterCard />
      <RemoteBackupCard />
      <DataBackupCard />
    </div>
  )
}
